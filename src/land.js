// Game parcels laid out over Türkiye. Shapes are generated, never cadastral: a jittered block
// grid is cut into irregular plots that tile the land without gaps, and the zoning on top of
// them is derived from published real-world data (see src/landuse.js and public/data/SOURCES.md).
import {hash,rng,lerp,centroid,insidePoint,areaSqm,compactness,cutRing,shrink,closed,indexRing,indexedContains} from './geometry.js';
import {landContext,isWater} from './landuse.js';
export {hash};
export const BLOCK=.002,CELL=BLOCK;
const CORNER_JITTER=.26,EDGE_BOW=.12,MIN_PARCEL=260,MIN_SHAPE=.3,CACHE_LIMIT=24000;
export const ID=/^TR-(\d{4,6})-(\d{4,6})-(\d{1,2})$/;

export const ZONES={
 field:{name:'Tarla',plan:'İmar planı dışı tarım arazisi',color:'#b9c583',floors:0,commercial:false,multiplier:1},
 home2:{name:'Konut · 2 kat',plan:'Ayrık nizam konut',color:'#b8cfe4',floors:2,commercial:false,multiplier:1.5},
 home3:{name:'Konut · 3 kat',plan:'Bitişik nizam konut',color:'#8eafd0',floors:3,commercial:false,multiplier:1.9},
 home5:{name:'Konut · 5 kat',plan:'Yoğun konut alanı',color:'#ac9dcc',floors:5,commercial:false,multiplier:2.4},
 mixed:{name:'Ticaret + konut',plan:'Merkezî iş alanı',color:'#d9b087',floors:5,commercial:true,multiplier:3.1}};
export const BUILDINGS={farm:{name:'Tarım bahçesi',icon:'🌾',cost:600,kind:'farm'},home:{name:'Konut',icon:'🏡',cost:1400,kind:'home'},cafe:{name:'Mahalle kafesi',icon:'☕',cost:1800,kind:'commercial'},shop:{name:'Dükkan',icon:'🏪',cost:2200,kind:'commercial'},fuel:{name:'Benzin istasyonu',icon:'⛽',cost:3200,kind:'commercial'}};
export const HOTSPOTS=[{name:'İstanbul',loc:[28.9784,41.0082]},{name:'İzmir',loc:[27.1428,38.4237]},{name:'Ankara',loc:[32.8597,39.9334]},{name:'Antalya',loc:[30.7133,36.8969]},{name:'Bodrum',loc:[27.4292,37.0344]},{name:'Trabzon',loc:[39.719,41.0027]},{name:'Gaziantep',loc:[37.3781,37.0662]},{name:'Diyarbakır',loc:[40.218,37.9144]}];

let polygons=[];
export function setBoundary(feature){const g=feature.geometry;
 polygons=(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(rings=>({
  outer:indexRing(rings[0].map(p=>[p[0],p[1]])),holes:rings.slice(1).map(r=>indexRing(r.map(p=>[p[0],p[1]])))}));}
export function inTurkey(point){return polygons.some(p=>indexedContains(p.outer,point)&&!p.holes.some(h=>indexedContains(h,point)));}

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
 for(const p of parcels){p.center=insidePoint(p.ring);p.area=Math.round(areaSqm(p.ring));p.id=`TR-${x}-${y}-${p.k}`;p.index=indexRing(p.ring);}
 const corners=[...ring,middle],land=corners.filter(inTurkey).length,wet=corners.filter(isWater).length;
 b={x,y,ring,index:indexRing(ring),center:middle,context,parcels,land,corners:corners.length,wet};
 keep(blockCache);blockCache.set(k,b);return b;}

// A parcel counts as playable when it holds real land and is not inside a mapped lake.
function onLand(b,p){if(b.land===b.corners&&!b.wet)return true;if(!b.land)return false;
 if(b.wet&&isWater(p.center))return false;
 return inTurkey(p.center)||p.ring.some(inTurkey);}

export function blockOf(lon,lat){const gx=Math.floor(lon/BLOCK),gy=Math.floor(lat/BLOCK);
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const b=block(gx+dx,gy+dy);
  if(indexedContains(b.index,[lon,lat]))return b;}
 return block(gx,gy);}
export function parcelId(lon,lat){const b=blockOf(lon,lat);
 const hit=b.parcels.find(p=>indexedContains(p.index,[lon,lat]));
 if(hit)return hit.id;
 let best=b.parcels[0],bd=Infinity;
 for(const p of b.parcels){const d=Math.hypot(p.center[0]-lon,p.center[1]-lat);if(d<bd){bd=d;best=p;}}
 return best.id;}
export function geometryOf(id){const m=ID.exec(id);if(!m)throw Error('Geçersiz dijital parsel.');
 const p=block(+m[1],+m[2]).parcels.find(q=>q.k===+m[3]);
 if(!p)throw Error('Bu dijital parsel artık haritada yok.');return p;}
export function coordinates(id){const m=ID.exec(id),p=geometryOf(id);
 return {x:+m[1],y:+m[2],k:+m[3],lon:p.center[0],lat:p.center[1],area:p.area};}
export function ringFor(id,factor=1){return closed(shrink(geometryOf(id).ring,factor));}
export function validParcel(id){try{const m=ID.exec(id);if(!m)return false;
 const b=block(+m[1],+m[2]),p=b.parcels.find(q=>q.k===+m[3]);
 return !!p&&onLand(b,p);}catch{return false;}}

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

// Credits per square metre: settlement size, how built-up the spot is and the plan on it.
export function unitPrice(zone,ctx,score,h){
 const city=.45+Math.min(1.15,Math.log10(Math.max(ctx.pop,800))/4.6);
 return (.075+1.45*score**2.5)*city*ZONES[zone].multiplier/2.2*(.85+(h%31)/100);}

export function parcel(id,week=0,holdings={}){const g=geometryOf(id),z=zoneFor(id,week),h=hash(id);
 const [lon,lat]=g.center,value=Math.max(120,Math.round(g.area*unitPrice(z.key,z.context,z.score,h)));
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

export function canBuild(p,type){return !!BUILDINGS[type]&&(type==='farm'?p.zone==='field':type==='home'?ZONES[p.zone].floors>0:ZONES[p.zone].commercial);}
export function upgradePrice(p){return 1000*(p.level||1);}
export function applyAction(state,user,action,id,data={}){
 if(!validParcel(id))throw Error('Bu dijital parsel Türkiye kara sınırı içinde değil.');
 const p=parcel(id,state.week,state.holdings);let cost=0,seller=null;
 if(action==='buy'){if(p.owner===user)throw Error('Bu parsel zaten senin.');if(p.owner&&!p.listing)throw Error('Bu parsel satışta değil.');cost=p.listing||p.value;seller=p.owner;}
 else{if(p.owner!==user)throw Error('Bu parsel sana ait değil.');
  if(action==='build'){if(p.building)throw Error('Bu parselde zaten bir yapı var.');if(!canBuild(p,data.type))throw Error('Oyun imar planı bu yapıya izin vermiyor.');cost=BUILDINGS[data.type].cost;}
  else if(action==='upgrade'){if(!p.building||p.building==='farm'||p.level>=ZONES[p.zone].floors)throw Error('İzin verilen kat sınırına ulaştın.');cost=upgradePrice(p);}
  else if(action==='list'){if(!Number.isSafeInteger(data.price)||data.price<100||data.price>1000000)throw Error('100–1.000.000 arasında tam sayı gir.');}
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
export function makeState(){return {version:3,holdings:{},balance:15000,week:0,revision:1};}

// Parcels for the current viewport. Blocks outside the map are skipped before any cutting work.
export function features(bounds,week,holdings,limit=900,cap=3600){
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
   if(!onLand(b,g))continue;
   const p=parcel(g.id,week,holdings);
   out.push({type:'Feature',id:g.id,geometry:{type:'Polygon',coordinates:[closed(g.ring)]},
    properties:{id:g.id,color:ZONES[p.zone].color,zone:p.zone,arsa:p.arsa?1:0,owner:p.owner||'',listing:p.listing||0,
     height:p.building&&p.building!=='farm'?p.level*9:0}});}}
 return {type:'FeatureCollection',features:out,truncated};}

export {hasLanduse,landContext,isWater,setLanduse} from './landuse.js';
