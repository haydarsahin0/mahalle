// Real-world context behind the game's zoning: built-up footprints, lakes and district records.
// Sources and their limits are listed in public/data/SOURCES.md. This is published reference
// data, not a municipality's development plan, so every result stays a game approximation.
import {indexRing,indexedContains,distanceToRing,bboxOf,metrePerLon,METRE_LAT} from './geometry.js';
import {coastDistanceKm} from './coast.js';

const URBAN_CELL=.05,TOWN_CELL=.25,TOWN_RINGS=4;
// Built-up land in Türkiye runs roughly 4,000 residents per square kilometre; used to turn a
// district's registered population into a settlement radius where no urban polygon exists.
const RESIDENTS_PER_KM2=4000;
let urban=[],water=[],towns=[],urbanGrid=new Map(),townGrid=new Map(),loaded=false;

const key=(x,y)=>x+':'+y;
function bucket(grid,k,value){let list=grid.get(k);if(!list)grid.set(k,list=[]);list.push(value);}
function unflatten(flat){const ring=[];for(let i=0;i<flat.length;i+=2)ring.push([flat[i],flat[i+1]]);
 if(ring.length>1&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1])ring.pop();return ring;}

export function setLanduse(doc){
 urban=(doc?.urban||[]).map(p=>{const ring=unflatten(p.r);return {ring,index:indexRing(ring),bbox:p.b||bboxOf(ring),km2:p.k||0};});
 water=(doc?.water||[]).map(p=>{const ring=unflatten(p.r);return {ring,index:indexRing(ring),name:p.n||''};});
 towns=(doc?.towns||[]).map(t=>({name:t.n,province:t.il,lon:t.lon,lat:t.lat,pop:t.pop||0,km2:t.km2||0,
  density:t.km2?t.pop/t.km2:0,metro:!!t.bs,radius:Math.sqrt(Math.max(t.pop,400)/RESIDENTS_PER_KM2/Math.PI)*1000}));
 urbanGrid=new Map();townGrid=new Map();
 urban.forEach((p,i)=>{const [x0,y0,x1,y1]=p.bbox,pad=.03;
  for(let x=Math.floor((x0-pad)/URBAN_CELL);x<=Math.floor((x1+pad)/URBAN_CELL);x++)
   for(let y=Math.floor((y0-pad)/URBAN_CELL);y<=Math.floor((y1+pad)/URBAN_CELL);y++)bucket(urbanGrid,key(x,y),i);});
 towns.forEach((t,i)=>bucket(townGrid,key(Math.floor(t.lon/TOWN_CELL),Math.floor(t.lat/TOWN_CELL)),i));
 loaded=urban.length>0&&towns.length>0;
 return loaded;}

export const hasLanduse=()=>loaded;

export function isWater(point){return water.some(p=>indexedContains(p.index,point));}

function nearestTown(lon,lat){const cx=Math.floor(lon/TOWN_CELL),cy=Math.floor(lat/TOWN_CELL);
 for(let r=0;r<=TOWN_RINGS;r++){let best=null,bestScore=Infinity;
  for(let x=cx-r;x<=cx+r;x++)for(let y=cy-r;y<=cy+r;y++){
   if(r&&Math.abs(x-cx)!==r&&Math.abs(y-cy)!==r)continue;
   for(const i of townGrid.get(key(x,y))||[]){const t=towns[i];
    const d=Math.hypot((t.lon-lon)*metrePerLon(lat),(t.lat-lat)*METRE_LAT);
    // Bigger settlements reach further, so compare distance relative to each town's own radius.
    const score=d/(t.radius+800);if(score<bestScore){bestScore=score;best={town:t,distance:d};}}}
  if(best&&(r||best.distance<TOWN_CELL*METRE_LAT/2))return best;
  if(best&&r===TOWN_RINGS)return best;}
 return null;}

const clamp=v=>v<0?0:v>1?1:v;

// Returns how built-up a location really is, plus the district record it belongs to.
export function landContext(lon,lat){
 const point=[lon,lat];let inUrban=false,depth=0;
 for(const i of urbanGrid.get(key(Math.floor(lon/URBAN_CELL),Math.floor(lat/URBAN_CELL)))||[]){
  const p=urban[i];if(indexedContains(p.index,point)){inUrban=true;depth=distanceToRing(point,p.ring);break;}}
 let fringe=Infinity;
 if(!inUrban)for(const i of urbanGrid.get(key(Math.floor(lon/URBAN_CELL),Math.floor(lat/URBAN_CELL)))||[]){
  const d=distanceToRing(point,urban[i].ring);if(d<fringe)fringe=d;}
 const near=nearestTown(lon,lat),town=near?.town||null,distance=near?near.distance:Infinity;
 const radius=town?town.radius:0;
 // Density and distance to the registered district centre decide how built-up the spot is.
 const compact=clamp(Math.log10((town?.density||0)+1)/4.2),core=radius?clamp(1-distance/(radius*1.2)):0;
 let score;
 if(inUrban)score=.62+.38*clamp(.45*core+.35*clamp(depth/1500)+.2*compact);
 else if(town&&distance<radius)score=.4+.42*core*(.45+.55*compact);
 else{
  const byTown=town?.42*clamp(1-(distance-radius)/(radius*1.5+3000)):0;
  const byEdge=fringe<Infinity?.6*clamp(1-fringe/2500):0;
  score=Math.max(byTown,byEdge);}
 return {score:clamp(score),inUrban,depth,fringe,town,distance,radius,
  density:town?.density||0,pop:town?.pop||0,metro:!!town?.metro,
  coastKm:coastDistanceKm(point)};}
