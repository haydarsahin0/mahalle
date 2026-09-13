// Game parcels laid out over Türkiye. Shapes are generated, never cadastral: a jittered block
// grid is cut into irregular plots that tile the land without gaps, and the zoning on top of
// them is derived from published real-world data (see src/landuse.js and public/data/SOURCES.md).
import {hash,rng,lerp,centroid,insidePoint,areaSqm,compactness,cutRing,shrink,closed,indexRing,indexedContains} from './geometry.js';
import {landContext,isWater} from './landuse.js';
import {setLand,onLand,clipToLand,coastNear} from './coast.js';
export {hash};
export const BLOCK=.002,CELL=BLOCK;
const CORNER_JITTER=.26,EDGE_BOW=.12,MIN_PARCEL=260,MIN_SHAPE=.3,MIN_COASTAL=140,CACHE_LIMIT=24000;
export const ID=/^TR-(\d{4,6})-(\d{4,6})-(\d{1,2})$/;

export const ZONES={
 field:{name:'Tarla',plan:'İmar planı dışı tarım arazisi',color:'#b9c583',floors:0,commercial:false,multiplier:1},
 home2:{name:'Konut · 2 kat',plan:'Ayrık nizam konut',color:'#b8cfe4',floors:2,commercial:false,multiplier:1.5},
 home3:{name:'Konut · 3 kat',plan:'Bitişik nizam konut',color:'#8eafd0',floors:3,commercial:false,multiplier:1.9},
 home5:{name:'Konut · 5 kat',plan:'Yoğun konut alanı',color:'#ac9dcc',floors:5,commercial:false,multiplier:2.4},
 mixed:{name:'Ticaret + konut',plan:'Merkezî iş alanı',color:'#d9b087',floors:5,commercial:true,multiplier:3.1}};
// One jeton is one Turkish lira, so building costs sit next to what land itself costs.
export const BUILDINGS={farm:{name:'Tarım bahçesi',icon:'🌾',cost:25,kind:'farm'},wheat:{name:'Buğday tarlası',icon:'🌿',cost:30,kind:'farm'},olive:{name:'Zeytinlik',icon:'🫒',cost:45,kind:'farm'},lavender:{name:'Lavanta bahçesi',icon:'💜',cost:40,kind:'farm'},greenhouse:{name:'Seracılık',icon:'🥬',cost:70,kind:'farm'},home:{name:'Konut',icon:'🏡',cost:60,kind:'home'},cafe:{name:'Mahalle kafesi',icon:'☕',cost:85,kind:'commercial'},shop:{name:'Dükkan',icon:'🏪',cost:110,kind:'commercial'},fuel:{name:'Benzin istasyonu',icon:'⛽',cost:160,kind:'commercial'}};
export const HOTSPOTS=[{name:'İstanbul',loc:[28.9784,41.0082]},{name:'İzmir',loc:[27.1428,38.4237]},{name:'Ankara',loc:[32.8597,39.9334]},{name:'Antalya',loc:[30.7133,36.8969]},{name:'Bodrum',loc:[27.4292,37.0344]},{name:'Trabzon',loc:[39.719,41.0027]},{name:'Gaziantep',loc:[37.3781,37.0662]},{name:'Diyarbakır',loc:[40.218,37.9144]}];

export {setLand,hasLand,landFeature} from './coast.js';
export const inTurkey=onLand;

// ---------------------------------------------------------------- parcel geometry
// Grid nodes and edge points are derived from their own coordinates alone, so neighbouring
// blocks always agree on the vertices they share and the tiling never opens a gap.
const nodeCache=new Map(),blockCache=new Map();
function keep(cache){if(cache.size>CACHE_LIMIT)cache.clear();}
function node(x,y){const k=x+':'+y;let p=nodeCache.get(k);if(p)return p;
 const r=rng(hash('node'+k));p=[(x+(r()-.5)*2*CORNER_JITTER)*BLOCK,(y+(r()-.5)*2*CORNER_JITTER)*BLOCK];
 keep(nodeCache);nodeCache.set(k,p);return p;}
function edgeNode(a,b,k){const r=rng(hash(k)),t=.35+r()*.3,m=lerp(a,b,t),off=(r()-.5)*2*EDGE_BOW;
 return [m[0]-(b[1]-a[1])*off,m[1]+(b[0]-a[0])*off];}
export function blockRing(x,y){const c00=node(x,y),c10=node(x+1,y),c11=node(x+1,y+1),c01=node(x,y+1);
 return [c00,edgeNode(c00,c10,'h'+x+':'+y),c10,edgeNode(c10,c11,'v'+(x+1)+':'+y),
  c11,edgeNode(c01,c11,'h'+x+':'+(y+1)),c01,edgeNode(c00,c01,'v'+x+':'+y)];}

// How finely a block is divided follows the real settlement pattern: city blocks split into
// many small plots, farmland stays in a few large fields.
function depthFor(score,r){const base=score>=.86?5:score>=.7?4.4:score>=.55?3.6:score>=.4?2.6:score>=.25?1.7:score>=.12?1:.4;
 return Math.max(0,Math.min(5,Math.round(base+(r()-.5)*1.4)));}

// Candidate cuts are scored instead of taken as they come: plots should look like land
// parcels, so splinters lose to compact pieces even when both are geometrically valid.
function chooseCut(ring,r,allowNotch){const n=ring.length;let best=null;
 for(let attempt=0;attempt<12;attempt++){
  const style=r(),i=Math.floor(r()*n);
  const j=style<.18?(i+1)%n:style<.34?(i+2)%n:(i+Math.floor(n/2)+(r()<.5?0:1))%n;
  const ti=.25+r()*.5,tj=.25+r()*.5,bulge=allowNotch&&style>=.34&&r()<.2?(r()-.5)*.36:0;
  if(i===j)continue;
  const pieces=cutRing(ring,i,ti,j,tj,bulge);
  if(!pieces)continue;
  const a=areaSqm(pieces[0]),b=areaSqm(pieces[1]);
  if(Math.min(a,b)<MIN_PARCEL||Math.min(a,b)<.13*(a+b))continue;
  const score=Math.min(compactness(pieces[0]),compactness(pieces[1]))*(bulge?.85:1);
  if(!best||score>best.score)best={pieces,terminal:!!bulge,score};
  if(score>.55)break;}
 return best&&best.score>=MIN_SHAPE?best:null;}

function divide(out,ring,index,depth,limit,seed,target){
 const r=rng(hash(seed+':'+index)),area=areaSqm(ring);
 // Sizes vary around the block's target plot, but nothing stays far above it.
 const stop=depth>=limit||index>=64||area<MIN_PARCEL*2.4||area<target*1.15||(area<target*2.6&&r()<.32);
 if(stop){out.push({k:index,ring});return;}
 const cut=chooseCut(ring,r,depth>0);
 if(!cut){out.push({k:index,ring});return;}
 // A notched cut already makes both halves irregular, so those pieces are never cut again.
 const sub=cut.terminal?0:limit;
 divide(out,cut.pieces[0],index*2,depth+1,sub,seed,target);
 divide(out,cut.pieces[1],index*2+1,depth+1,sub,seed,target);}

// Everything about one block: its outline, its real-world context and its parcels.
export function block(x,y){const k=x+':'+y;let b=blockCache.get(k);if(b)return b;
 const ring=blockRing(x,y),middle=centroid(ring),context=landContext(middle[0],middle[1]);
 const r=rng(hash('depth'+k)),parcels=[],limit=depthFor(context.score,r);
 divide(parcels,ring,1,0,limit,'cut'+k,areaSqm(ring)/2**limit);
 // Coastal blocks are cut against the real shoreline; inland blocks skip that work entirely.
 const box=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
 const coastal=coastNear(box),dry=coastal?null:onLand(middle);
 const kept=[];
 for(const p of parcels){
  if(coastal){const clipped=clipToLand(p.ring);
   if(!clipped||areaSqm(clipped)<MIN_COASTAL)continue;
   p.ring=clipped;}
  else if(!dry)continue;
  p.center=insidePoint(p.ring);
  if(isWater(p.center)||p.ring.some(isWater))continue;
  p.area=Math.round(areaSqm(p.ring));
  if(p.area<MIN_COASTAL)continue;
  p.id=`TR-${x}-${y}-${p.k}`;p.index=indexRing(p.ring);kept.push(p);}
 b={x,y,ring,index:indexRing(ring),center:middle,context,parcels:kept,land:kept.length};
 keep(blockCache);blockCache.set(k,b);return b;}

// Every parcel kept by block() is already cut to the shoreline and clear of mapped water.
function playable(b,p){return !!p&&b.parcels.includes(p);}

export function blockOf(lon,lat){const gx=Math.floor(lon/BLOCK),gy=Math.floor(lat/BLOCK);
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const b=block(gx+dx,gy+dy);
  if(indexedContains(b.index,[lon,lat]))return b;}
 return block(gx,gy);}
// The parcel under a point, or null when that spot carries none (sea, lake, foreign land).
export function parcelId(lon,lat){const b=blockOf(lon,lat);
 const hit=b.parcels.find(p=>indexedContains(p.index,[lon,lat]));
 if(hit)return hit.id;
 let best=null,bd=Infinity;
 for(const dx of [-1,0,1])for(const dy of [-1,0,1])for(const p of block(Math.floor(lon/BLOCK)+dx,Math.floor(lat/BLOCK)+dy).parcels){
  const d=Math.hypot((p.center[0]-lon)*.77,p.center[1]-lat);if(d<bd){bd=d;best=p;}}
 return bd<BLOCK*1.5?best.id:null;}
export function geometryOf(id){const m=ID.exec(id);if(!m)throw Error('Geçersiz dijital parsel.');
 const p=block(+m[1],+m[2]).parcels.find(q=>q.k===+m[3]);
 if(!p)throw Error('Bu dijital parsel artık haritada yok.');return p;}
export function coordinates(id){const m=ID.exec(id),p=geometryOf(id);
 return {x:+m[1],y:+m[2],k:+m[3],lon:p.center[0],lat:p.center[1],area:p.area};}
export function ringFor(id,factor=1){return closed(shrink(geometryOf(id).ring,factor));}
export function validParcel(id){try{const m=ID.exec(id);if(!m)return false;
 const b=block(+m[1],+m[2]),p=b.parcels.find(q=>q.k===+m[3]);
 return playable(b,p);}catch{return false;}}

// ---------------------------------------------------------------- zoning from real data
export function epochWeek(now=Date.now()){return Math.max(0,Math.floor((now-Date.UTC(2026,8,13))/(7*86400000)));}
const clamp=v=>v<0?0:v>1?1:v;
export function zoneFor(id,week=0){const m=ID.exec(id);if(!m)throw Error('Geçersiz dijital parsel.');
 const b=block(+m[1],+m[2]),c=b.context,h=hash(id);
 // Plot-level variation on top of the measured context keeps a street from being uniform.
 const score=clamp(c.score+((h%1000)/1000-.5)*.13);
 const dense=c.pop>=75000||c.density>=1500,townish=c.pop>=25000||c.density>=400;
 const centre=h%100;
 let base='field';
 if(score>=.86)base=centre<15&&townish?'mixed':dense?'home5':'home3';
 else if(score>=.72)base=centre<8&&townish?'mixed':dense?'home5':'home3';
 else if(score>=.56)base=centre<4&&townish?'mixed':'home3';
 else if(score>=.4)base=centre<8?'home3':'home2';
 const fringe=base==='field'&&score>=.26;
 const review=2+h%5,approved=fringe&&h%3===0;
 const key=fringe&&week>=review&&approved?(dense?'home3':'home2'):base;
 return {key,base,score,fringe,review,approved,dense,townish,
  district:c.town?`${c.town.name} / ${c.town.province}`:'Kırsal alan',context:c};}

// Jetons per square metre, where one jeton is one Turkish lira. Remote farmland sits exactly
// on the ten-kuruş floor; every other parcel is a multiple of it, driven by the same real
// settlement data: district population, how built-up the spot is and the plan on the parcel.
export const BASE_PRICE=.1;
export function unitPrice(zone,ctx,score,h){
 const city=.35+Math.min(1.05,(Math.log10(Math.max(ctx.pop,300))-2.5)/2.2);
 const premium=4*score**2.2*city*(ZONES[zone].multiplier/2.2)*(.9+(h%23)/100);
 return BASE_PRICE*(1+premium);}

export function parcel(id,week=0,holdings={}){const g=geometryOf(id),z=zoneFor(id,week),h=hash(id);
 const [lon,lat]=g.center,value=Math.max(10,Math.round(g.area*unitPrice(z.key,z.context,z.score,h)));
 return {id,lon,lat,area:g.area,zone:z.key,value,arsa:z.key!=='field',...z,...holdings[id]};}

export function rumor(p,week){const near=p.context.town?`${p.context.town.name} / ${p.context.town.province}`:'en yakın yerleşim';
 if(p.base!=='field')return {title:'Yürürlükteki oyun planı',state:'Kesin oyun kuralı',
  text:`Bu parsel ${near} yerleşik alanı içinde sayılıyor ve oyunda ${ZONES[p.zone].name.toLocaleLowerCase('tr')} izni taşıyor. Gerçek belediye imar planı değildir.`};
 if(!p.fringe)return {title:'Uzun vadede tarım arazisi',state:'Oyun değerlendirmesi',
  text:`Yerleşik alana ${(p.context.distance/1000).toFixed(1)} km uzakta. Oyun kurgusunda bu mesafede imar beklenmiyor; tarla olarak kalıyor.`};
 if(week<p.review)return {title:'Gelişme sınırında konuşuluyor…',state:'Doğrulanmamış oyun söylentisi',
  text:`Parsel ${near} yerleşik alanının hemen kenarında. Oyun planı ${p.review+1}. haftada görüşülecek; kabul de ret de mümkün. Söylenti yapı izni vermez.`};
 return p.approved?{title:'Oyun planı onaylandı',state:'Oyun kararı',
  text:'Yerleşik alana bitişik bu parsel oyun içinde konut iznine geçti. Yeni değer ve yapı hakları uygulanıyor.'}
  :{title:'Oyun planı ertelendi',state:'Oyun kararı',text:'Başvuru oyun içinde kabul edilmedi. Tarla niteliği ve yapı yasağı devam ediyor.'};}

export function canBuild(p,type){return !!BUILDINGS[type]&&(BUILDINGS[type].kind==='farm'?p.zone==='field':BUILDINGS[type].kind==='home'?ZONES[p.zone].floors>0:ZONES[p.zone].commercial);}
export function upgradePrice(p){return 45*(p.level||1);}
export function applyAction(state,user,action,id,data={}){
 if(!validParcel(id))throw Error('Bu dijital parsel Türkiye kara sınırı içinde değil.');
 const p=parcel(id,state.week,state.holdings);let cost=0,seller=null;
 if(action==='buy'){if(p.owner===user)throw Error('Bu parsel zaten senin.');if(p.owner&&!p.listing)throw Error('Bu parsel satışta değil.');cost=p.listing||p.value;seller=p.owner;}
 else{if(p.owner!==user)throw Error('Bu parsel sana ait değil.');
  if(action==='build'){if(p.building)throw Error('Bu parselde zaten bir yapı var.');if(!canBuild(p,data.type))throw Error('Oyun imar planı bu yapıya izin vermiyor.');cost=BUILDINGS[data.type].cost;}
  else if(action==='upgrade'){if(!p.building||p.building==='farm'||p.level>=ZONES[p.zone].floors)throw Error('İzin verilen kat sınırına ulaştın.');cost=upgradePrice(p);}
  else if(action==='list'){if(!Number.isSafeInteger(data.price)||data.price<10||data.price>1000000)throw Error('10–1.000.000 jeton arasında tam sayı gir.');}
  else if(action!=='unlist')throw Error('Geçersiz işlem.');}
 if(state.balance<cost)throw Error('Yeterli oyun jetonu yok.');
 state.balance-=cost;const owned={...state.holdings[id]};
 if(action==='buy'){owned.owner=user;owned.listing=null;}
 if(action==='build'){owned.building=data.type;owned.level=data.type==='farm'?0:1;}
 if(action==='upgrade')owned.level++;
 if(action==='list')owned.listing=data.price;
 if(action==='unlist')owned.listing=null;
 state.holdings[id]=owned;state.revision=(state.revision||0)+1;
 return {cost,seller,p:parcel(id,state.week,state.holdings)};}
export function makeState(){return {version:4,holdings:{},balance:0,week:0,revision:1};}

// Parcels for the current viewport. Blocks outside the map are skipped before any cutting work.
export function features(bounds,week,holdings,limit=900,cap=3600,userId=null){
 const [west,south,east,north]=bounds;
 const minX=Math.floor(Math.max(25.5,west)/BLOCK)-1,maxX=Math.floor(Math.min(45,east)/BLOCK)+1;
 const minY=Math.floor(Math.max(35.7,south)/BLOCK)-1,maxY=Math.floor(Math.min(42.3,north)/BLOCK)+1;
 if(maxX<minX||maxY<minY)return {type:'FeatureCollection',features:[],truncated:false};
 if((maxX-minX+1)*(maxY-minY+1)>limit)return null;
 const out=[];let truncated=false;
 for(let x=minX;x<=maxX&&!truncated;x++)for(let y=minY;y<=maxY;y++){
  const b=block(x,y);if(!b.land)continue;
  for(const g of b.parcels){
   if(out.length>=cap){truncated=true;break;}
   const p=parcel(g.id,week,holdings);
   out.push({type:'Feature',id:g.id,geometry:{type:'Polygon',coordinates:[closed(g.ring)]},
    properties:{id:g.id,color:ZONES[p.zone].color,zone:p.zone,arsa:p.arsa?1:0,owner:p.owner||'',owned:userId&&p.owner===userId?1:0,listing:p.listing||0,
     height:p.building&&BUILDINGS[p.building]?.kind!=='farm'?p.level*9:0}});}}
 return {type:'FeatureCollection',features:out,truncated};}

export {hasLanduse,landContext,isWater,setLanduse} from './landuse.js';
