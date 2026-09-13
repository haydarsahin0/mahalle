// The real coastline. Land polygons come from OpenStreetMap (geoBoundaries TUR ADM0), simplified
// to roughly 20 m — finer than a parcel, so parcels can be cut exactly at the shore instead of
// floating on the sea. Points live in flat typed arrays: the country has tens of thousands of
// boundary vertices and one array object per vertex would cost far more memory.
import {pointInRing,insidePoint,segmentsIntersect,splitRingByPath,splitRingOnEdge,areaSqm} from './geometry.js';

const BAND=.005,CELL=.02;
// bands: latitude strips for ray casting. cells: a square grid so a parcel only looks at the
// coastline segments in its own neighbourhood instead of everything at its latitude.
let polygons=[],bands=new Map(),cells=new Map(),loaded=false,parity=null,seen=null,stamp=0;
const cellKey=(x,y)=>x+':'+y;

export function setLand(doc){
 polygons=[];bands=new Map();cells=new Map();
 for(const entry of doc?.polygons||[]){
  const outer=Float64Array.from(entry.r||[]);if(outer.length<6)continue;
  polygons.push({rings:[outer,...(entry.h||[]).map(h=>Float64Array.from(h))]});}
 // Each segment is filed under the latitude bands it spans, so a point or a parcel only ever
 // scans the handful of coastline segments near it.
 polygons.forEach((polygon,p)=>polygon.rings.forEach((coords,r)=>{
  const id=p*16+Math.min(r,15),count=coords.length/2;
  for(let i=0,j=count-1;i<count;j=i++){const y1=coords[j*2+1],y2=coords[i*2+1];if(y1===y2)continue;
   const lo=Math.floor(Math.min(y1,y2)/BAND),hi=Math.floor(Math.max(y1,y2)/BAND);
   for(let b=lo;b<=hi;b++){let list=bands.get(b);if(!list)bands.set(b,list=[]);list.push(id,i);}}
  for(let i=0,j=count-1;i<count;j=i++){
   const x0=Math.floor(Math.min(coords[j*2],coords[i*2])/CELL),x1=Math.floor(Math.max(coords[j*2],coords[i*2])/CELL);
   const y0=Math.floor(Math.min(coords[j*2+1],coords[i*2+1])/CELL),y1=Math.floor(Math.max(coords[j*2+1],coords[i*2+1])/CELL);
   for(let cx=x0;cx<=x1;cx++)for(let cy=y0;cy<=y1;cy++){
    const k=cellKey(cx,cy);let list=cells.get(k);if(!list)cells.set(k,list=[]);list.push(id,i);}}}));
 parity=new Int32Array(polygons.length*16);seen=new Int32Array(polygons.length*16);stamp=0;
 loaded=polygons.length>0;
 return loaded;}
export const hasLand=()=>loaded;

const ringOf=id=>polygons[id>>4]?.rings[id&15];
const vertex=(coords,i)=>[coords[i*2],coords[i*2+1]];

// Ray casting over the segments filed in this point's latitude band only.
export function onLand([x,y]){
 if(!loaded)return false;
 const list=bands.get(Math.floor(y/BAND));if(!list)return false;
 stamp++;const touched=[];
 for(let n=0;n<list.length;n+=2){const id=list[n],i=list[n+1],coords=ringOf(id);if(!coords)continue;
  const count=coords.length/2,j=(i+count-1)%count;
  const xi=coords[i*2],yi=coords[i*2+1],xj=coords[j*2],yj=coords[j*2+1];
  if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)){
   if(seen[id]!==stamp){seen[id]=stamp;parity[id]=0;touched.push(id);}
   parity[id]^=1;}}
 let inside=false;
 for(const id of touched){if(!(parity[id]&1))continue;
  if(id&15)return false; // inside a hole: inland water carved out of the polygon
  inside=true;}
 return inside;}

// Coastline vertices and segments that reach into a parcel, grouped into the runs ("chains")
// that cross it. Returns null when the shore is too intricate to cut cleanly.
function chainThrough(ring){
 const box=ring.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[180,90,-180,-90]);
 const candidates=new Map();
 for(let cx=Math.floor(box[0]/CELL);cx<=Math.floor(box[2]/CELL);cx++)
 for(let cy=Math.floor(box[1]/CELL);cy<=Math.floor(box[3]/CELL);cy++){
  const list=cells.get(cellKey(cx,cy));if(!list)continue;
  for(let n=0;n<list.length;n+=2){const id=list[n],i=list[n+1],coords=ringOf(id);if(!coords)continue;
   const count=coords.length/2,j=(i+count-1)%count;
   const x1=coords[j*2],y1=coords[j*2+1],x2=coords[i*2],y2=coords[i*2+1];
   if(Math.max(x1,x2)<box[0]||Math.min(x1,x2)>box[2]||Math.max(y1,y2)<box[1]||Math.min(y1,y2)>box[3])continue;
   let hit=candidates.get(id);if(!hit)candidates.set(id,hit={inside:new Set(),segments:[]});
   hit.segments.push(j,i);
   for(const k of [j,i])if(pointInRing(vertex(coords,k),ring))hit.inside.add(k);}}
 if(!candidates.size)return {chains:[]};
 const chains=[];
 for(const [id,hit] of candidates){const coords=ringOf(id),count=coords.length/2;
  if(hit.inside.size){
   if(hit.inside.size>=count)return null; // a whole island sits inside this parcel
   // Walk back to the first vertex of the run, then forward to collect it.
   const first=[...hit.inside][0];let start=first,guard=0;
   while(hit.inside.has((start+count-1)%count)&&guard++<count)start=(start+count-1)%count;
   const points=[];let k=start;
   while(hit.inside.has(k)&&points.length<=count){points.push(vertex(coords,k));k=(k+1)%count;}
   if(points.length!==hit.inside.size)return null; // more than one run through the parcel
   chains.push({points,before:vertex(coords,(start+count-1)%count),after:vertex(coords,k)});
  }else{
   // No vertex inside: the shore may still cut straight across the parcel.
   const crossings=[];
   for(let s=0;s<hit.segments.length;s+=2){const a=vertex(coords,hit.segments[s]),b=vertex(coords,hit.segments[s+1]);
    for(let e=0;e<ring.length;e++)if(segmentsIntersect(a,b,ring[e],ring[(e+1)%ring.length])){crossings.push([a,b]);break;}}
   if(!crossings.length)continue;
   if(crossings.length>1)return null;
   chains.push({points:[],before:crossings[0][0],after:crossings[0][1]});}}
 return {chains};}

// Every point where segment a→b meets the parcel outline, ordered along the segment.
function crossingsWith(ring,a,b){const out=[];
 for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];
  const d=(q[0]-p[0])*(b[1]-a[1])-(q[1]-p[1])*(b[0]-a[0]);
  if(Math.abs(d)<1e-15)continue;
  const t=((a[0]-p[0])*(b[1]-a[1])-(a[1]-p[1])*(b[0]-a[0]))/d;
  const u=((a[0]-p[0])*(q[1]-p[1])-(a[1]-p[1])*(q[0]-p[0]))/d;
  if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9)continue;
  out.push({edge:i,t:Math.min(1-1e-9,Math.max(1e-9,t)),u});}
 return out.sort((m,n)=>m.u-n.u);}

// Is there any coastline inside this box at all? Lets whole inland blocks skip the cut work.
export function coastNear([x0,y0,x1,y1]){
 for(let cx=Math.floor(x0/CELL);cx<=Math.floor(x1/CELL);cx++)
 for(let cy=Math.floor(y0/CELL);cy<=Math.floor(y1/CELL);cy++)if(cells.has(cellKey(cx,cy)))return true;
 return false;}

// The loaded land as GeoJSON, for drawing the coastline on the map.
export function landFeature(){return {type:'Feature',properties:{source:'OpenStreetMap / geoBoundaries TUR ADM0'},
 geometry:{type:'MultiPolygon',coordinates:polygons.map(p=>p.rings.map(coords=>{
  const ring=[];for(let i=0;i<coords.length;i+=2)ring.push([coords[i],coords[i+1]]);
  ring.push([coords[0],coords[1]]);return ring;}))}};}

export function clipToLand(ring,depth=0){
 if(!loaded)return ring;
 const found=chainThrough(ring);
 if(found===null)return null;
 const {chains}=found;
 if(!chains.length)return onLand(insidePoint(ring))?ring:null;
 if(depth>=4)return null;
 // One shore chain at a time; each piece is clipped again, because a bay can bring a second
 // chain into a piece that the first cut created.
 const {points,before,after}=chains[0];
 let entry,exit;
 if(points.length){
  // The shore walks in from `before` and leaves towards `after`.
  const inbound=crossingsWith(ring,before,points[0]),outbound=crossingsWith(ring,points[points.length-1],after);
  entry=inbound[inbound.length-1];exit=outbound[0];
 }else{
  // A single straight segment of shore cuts across the parcel.
  const both=crossingsWith(ring,before,after);
  if(both.length<2)return null;
  entry=both[0];exit=both[both.length-1];}
 if(!entry||!exit)return null;
 const pieces=entry.edge===exit.edge
  ? splitRingOnEdge(ring,entry.edge,entry.t,exit.t,points)
  : splitRingByPath(ring,entry.edge,entry.t,exit.edge,exit.t,points,false);
 if(!pieces)return null;
 const land=[];
 for(const piece of pieces){if(piece.length<3)continue;
  const clipped=clipToLand(piece,depth+1);
  if(clipped)land.push(clipped);}
 if(!land.length)return null;
 // A parcel stays one polygon: if water splits it in two, only the larger side survives.
 return land.length===1?land[0]:land.sort((a,b)=>areaSqm(b)-areaSqm(a))[0];}
