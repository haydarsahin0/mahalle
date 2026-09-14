export const SEEDS=[
 {name:'Papatya',icon:'🌼',seconds:45,level:1},
 {name:'Turp',icon:'🥕',seconds:90,level:1},
 {name:'Çilek',icon:'🍓',seconds:180,level:2},
 {name:'Ayçiçeği',icon:'🌻',seconds:300,level:3},
 {name:'Lavanta',icon:'🪻',seconds:600,level:4},
 {name:'Gül',icon:'🌹',seconds:900,level:5}
];
export const day=now=>new Date(now).toISOString().slice(0,10);
export const level=s=>1+Math.floor(s.xp/40);
export function fresh(now=Date.now()){return {xp:0,tiles:Array(9).fill(null),collection:Array(6).fill(0),day:day(now),tasks:{plant:0,water:0,harvest:0,weed:0},claimed:false,weeded:[]};}
export function normalize(raw,now){const s=fresh(now);if(raw&&Array.isArray(raw.tiles)&&raw.tiles.length===9){Object.assign(s,raw);s.xp=Math.max(0,Number(raw.xp)||0);s.collection=SEEDS.map((_,i)=>Math.max(0,Number(raw.collection?.[i])||0));s.tiles=raw.tiles.map(t=>t&&SEEDS[t.seed]&&Number.isFinite(t.ready)?t:null);}if(s.day!==day(now)){s.day=day(now);s.tasks={plant:0,water:0,harvest:0,weed:0};s.claimed=false;s.weeded=[];}return s;}
export function ready(t,now){return !!t&&t.watered&&now>=t.ready;}
export function complete(s){return s.tasks.plant>=3&&s.tasks.water>=3&&s.tasks.harvest>=3&&s.tasks.weed>=3;}
export function move(raw,action,index,seed=0,now=Date.now()){
 const s=normalize(structuredClone(raw),now);const t=s.tiles[index];
 if(action==='claim'){if(!complete(s)||s.claimed)throw Error('Önce günlük görevleri tamamla.');s.claimed=true;s.xp+=20;return s;}
 if(!Number.isInteger(index)||index<0||index>8)throw Error('Bir ekim alanı seç.');
 if(action==='plant'){if(t)throw Error('Bu alan dolu.');if(!s.weeded.includes(index))throw Error('Önce bu alandaki otları temizle.');if(!SEEDS[seed]||level(s)<SEEDS[seed].level)throw Error('Bu tohum için bahçeni geliştir.');s.tiles[index]={seed,ready:now+SEEDS[seed].seconds*1000,watered:false};s.tasks.plant++;s.xp+=1;}
 else if(action==='water'){if(!t||t.watered)throw Error('Sulama bekleyen bir filiz seç.');t.watered=true;s.tasks.water++;s.xp+=1;}
 else if(action==='harvest'){if(!ready(t,now))throw Error('Ürün henüz hazır değil.');s.collection[t.seed]++;s.tiles[index]=null;s.tasks.harvest++;s.xp+=6;}
 else if(action==='weed'){if(s.weeded.includes(index))throw Error('Bu alan bugün temizlendi.');s.weeded.push(index);s.tasks.weed++;s.xp+=1;}
 else throw Error('Bir bahçe aracı seç.');
 return s;
}
