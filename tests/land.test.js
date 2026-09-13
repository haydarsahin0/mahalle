import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setBoundary,setLanduse,parcelId,coordinates,inTurkey,validParcel,parcel,zoneFor,block,blockRing,ringFor,
 features,makeState,applyAction,ZONES,canBuild,unitPrice,BLOCK} from '../src/land.js';
import {areaSqm,pointInRing,insidePoint} from '../src/geometry.js';
import {landContext,isWater} from '../src/landuse.js';
setBoundary(JSON.parse(readFileSync(new URL('../public/data/turkey.json',import.meta.url))));
assert.ok(setLanduse(JSON.parse(readFileSync(new URL('../public/data/landuse.json',import.meta.url)))));

const CITY=[32.8597,39.9334],FARM=[33.2,38.3];
function find(predicate,[lon,lat]=CITY,span=60){
 for(let dx=0;dx<span;dx++)for(let dy=0;dy<span;dy++){
  const b=block(Math.floor(lon/BLOCK)+dx,Math.floor(lat/BLOCK)+dy);
  for(const g of b.parcels){if(!validParcel(g.id))continue;const p=parcel(g.id);if(predicate(p))return g.id;}}
 throw Error('fixture not found');}
const field=find(p=>p.zone==='field',FARM),home=find(p=>p.zone==='home2'||p.zone==='home3'),commercial=find(p=>p.zone==='mixed');

test('parcels reproduce IDs and reject water, foreign land and malformed input',()=>{
 const id=parcelId(...CITY),c=coordinates(id);
 assert.equal(parcelId(c.lon,c.lat),id);
 assert.ok(validParcel(id));
 assert.equal(inTurkey([29,35]),false);
 assert.equal(validParcel(parcelId(23,38)),false);
 assert.equal(validParcel('__proto__'),false);
 assert.equal(validParcel('TR-NaN-NaN-1'),false);
 assert.equal(validParcel('TR-16429-19966-99'),false);
 assert.ok(isWater([43,38.6]));});

test('parcels tile their block without gaps or overlaps',()=>{
 for(let dx=0;dx<6;dx++)for(let dy=0;dy<6;dy++){
  const x=Math.floor(CITY[0]/BLOCK)+dx,y=Math.floor(CITY[1]/BLOCK)+dy,b=block(x,y);
  const sum=b.parcels.reduce((n,p)=>n+areaSqm(p.ring),0),whole=areaSqm(b.ring);
  assert.ok(Math.abs(sum-whole)/whole<1e-6,'parcels must cover the whole block');
  // Every neighbouring block reuses the same three vertices along the shared edge.
  const right=blockRing(x+1,y),up=blockRing(x,y+1),ring=blockRing(x,y),same=(p,q)=>p[0]===q[0]&&p[1]===q[1];
  assert.ok(same(ring[2],right[0])&&same(ring[3],right[7])&&same(ring[4],right[6]));
  assert.ok(same(ring[6],up[0])&&same(ring[5],up[1])&&same(ring[4],up[2]));
  // Each parcel's own reference point falls inside exactly one parcel of the block.
  for(const p of b.parcels)assert.equal(b.parcels.filter(q=>pointInRing(insidePoint(p.ring),q.ring)).length,1);}});

test('shapes and sizes vary: triangles, many-sided plots, small city lots and large fields',()=>{
 const city=[],farm=[];
 for(let dx=0;dx<14;dx++)for(let dy=0;dy<14;dy++){
  city.push(...block(Math.floor(CITY[0]/BLOCK)+dx,Math.floor(CITY[1]/BLOCK)+dy).parcels);
  farm.push(...block(Math.floor(FARM[0]/BLOCK)+dx,Math.floor(FARM[1]/BLOCK)+dy).parcels);}
 const sides=new Set(city.map(p=>p.ring.length));
 assert.ok(sides.has(3),'some parcels are triangles');
 assert.ok([...sides].some(n=>n>=6),'some parcels have six or more corners');
 const areas=city.map(p=>p.area).sort((a,b)=>a-b);
 assert.ok(areas[0]<areas[areas.length-1]/5,'city plot sizes differ widely');
 const cityMedian=areas[Math.floor(areas.length/2)],farmAreas=farm.map(p=>p.area).sort((a,b)=>a-b);
 assert.ok(farmAreas[Math.floor(farmAreas.length/2)]>cityMedian*3,'farmland stays in larger parcels');
 assert.equal(ringFor(city[0].id)[0][0],ringFor(city[0].id).at(-1)[0]);});

test('zoning follows real settlement data, not the grid',()=>{
 const centre=landContext(...CITY),plain=landContext(...FARM);
 assert.ok(centre.score>.8&&centre.pop>50000);
 assert.equal(plain.score,0);
 assert.equal(parcel(parcelId(...FARM)).arsa,false);
 assert.ok(parcel(parcelId(...CITY)).arsa);
 // Denser, larger districts are worth more per square metre than remote farmland.
 const h=1;
 assert.ok(unitPrice('home3',centre,centre.score,h)>unitPrice('field',plain,plain.score,h)*10);});

test('agricultural zoning forbids houses and commercial premises',()=>{
 const s=makeState();s.balance=1000000;applyAction(s,'a','buy',field);
 const before=JSON.stringify(s);
 assert.throws(()=>applyAction(s,'a','build',field,{type:'home'}));
 assert.equal(JSON.stringify(s),before);
 assert.throws(()=>applyAction(s,'a','build',field,{type:'cafe'}));
 applyAction(s,'a','build',field,{type:'farm'});
 assert.equal(s.holdings[field].building,'farm');});

test('residential floor limits and commercial permissions enforced',()=>{
 const s=makeState();s.balance=1000000;
 applyAction(s,'a','buy',home);applyAction(s,'a','build',home,{type:'home'});
 const floors=ZONES[parcel(home).zone].floors;
 for(let i=1;i<floors;i++)applyAction(s,'a','upgrade',home);
 assert.equal(s.holdings[home].level,floors);
 assert.throws(()=>applyAction(s,'a','upgrade',home));
 assert.equal(canBuild(parcel(home),'shop'),false);
 applyAction(s,'a','buy',commercial);applyAction(s,'a','build',commercial,{type:'cafe'});
 assert.equal(s.holdings[commercial].building,'cafe');});

test('ownership, insufficient funds and resale use authoritative prices',()=>{
 const s=makeState();s.balance=0;
 assert.throws(()=>applyAction(s,'a','buy',home));
 s.balance=1000000;
 const result=applyAction(s,'a','buy',home,{price:1});
 assert.equal(result.cost,parcel(home).value);
 assert.throws(()=>applyAction(s,'b','build',home,{type:'home'}));
 assert.throws(()=>applyAction(s,'b','buy',home));
 applyAction(s,'a','list',home,{price:2000});
 const sale=applyAction(s,'b','buy',home);
 assert.equal(sale.seller,'a');assert.equal(sale.cost,2000);
 assert.equal(s.holdings[home].owner,'b');assert.equal(s.holdings[home].listing,null);});

test('only fringe farmland can be rezoned, and it can still be refused',()=>{
 const seen={true:false,false:false};
 for(let dx=0;dx<40&&!(seen.true&&seen.false);dx++)for(let dy=0;dy<40;dy++){
  const b=block(Math.floor(26.3024/BLOCK)+dx,Math.floor(38.3229/BLOCK)+dy);
  for(const g of b.parcels){const z=zoneFor(g.id);if(!z.fringe||!validParcel(g.id))continue;
   assert.equal(parcel(g.id,z.review-1).zone,'field');
   const after=parcel(g.id,z.review);
   assert.equal(after.zone==='field',!z.approved);
   if(z.approved)assert.ok(after.value>parcel(g.id,0).value);
   seen[z.approved]=true;}}
 assert.ok(seen.true&&seen.false,'both approvals and refusals occur');
 const remote=parcel(parcelId(...FARM));
 assert.equal(remote.fringe,false);
 assert.equal(parcel(remote.id,52).zone,'field');});

test('large viewports are bounded; local parcels are valid, unique and on land',()=>{
 assert.equal(features([26,36,45,42],0,{}),null);
 const fc=features([32.855,39.93,32.862,39.937],0,{});
 assert.ok(fc.features.length>20);
 assert.equal(new Set(fc.features.map(f=>f.id)).size,fc.features.length);
 assert.ok(fc.features.every(f=>validParcel(f.id)));
 assert.ok(fc.features.every(f=>f.geometry.coordinates[0].length>=4));
 assert.equal(features([26,36,26.001,36.001],0,{}).features.length,0);});

test('81 province records and district coordinate bounds',()=>{
 const cities=JSON.parse(readFileSync(new URL('../public/data/places.json',import.meta.url)));
 assert.equal(cities.length,81);
 for(const c of cities){assert.ok(c.longitude>25&&c.longitude<45&&c.latitude>35&&c.latitude<43);assert.ok(c.towns.length);}});

test('bundled land-use data covers every district with real population figures',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/data/landuse.json',import.meta.url)));
 assert.equal(data.towns.length,973);
 assert.ok(data.urban.length>250);
 assert.ok(data.towns.every(t=>t.pop>0&&t.km2>0&&t.lon>25&&t.lon<45&&t.lat>35&&t.lat<43));
 assert.ok(data.towns.reduce((n,t)=>n+t.pop,0)>80000000);});
