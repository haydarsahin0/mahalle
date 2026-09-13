// The map rules the server trusts. Prices, zoning and whether a parcel exists at all are
// recomputed here from the same bundled data the browser draws, so a tampered request buys
// nothing: the client's numbers are never taken at face value.
// @ts-nocheck — plain ES modules shared with the browser build.
import {setLand,setLanduse,validParcel,parcel,canBuild,upgradePrice,epochWeek,BUILDINGS,ZONES} from './land.js';
import land from './land.json' with {type:'json'};
import landuse from './landuse.json' with {type:'json'};

let ready=false;
function load(){if(ready)return;
 if(!setLand(land))throw new Error('Kara sınırı verisi yüklenemedi.');
 if(!setLanduse(landuse))throw new Error('Yerleşim verisi yüklenemedi.');
 ready=true;}

export function parcelFor(id:string){load();
 if(typeof id!=='string'||!validParcel(id))throw new Error('Bu dijital parsel haritada yok.');
 return parcel(id,epochWeek(),{});}

// What an action costs, in jetons, given the parcel's own row as the database holds it.
export function priceOf(action:string,id:string,row:{owner_id?:string;listing?:number|null;level?:number}|null,data:{type?:string;price?:number}){
 const p=parcelFor(id);
 if(action==='buy')return {cost:row?Number(row.listing??0):p.value,parcel:p};
 if(action==='build'){
  const building=BUILDINGS[data.type as string];
  if(!building)throw new Error('Geçersiz yapı.');
  if(!canBuild(p,data.type))throw new Error('Oyun imar planı bu yapıya izin vermiyor.');
  return {cost:building.cost,parcel:p};}
 if(action==='upgrade')return {cost:upgradePrice({level:row?.level||1}),parcel:p};
 if(action==='list'||action==='unlist')return {cost:0,parcel:p};
 throw new Error('Geçersiz işlem.');}

export const floorsFor=(p:{zone:string})=>ZONES[p.zone].floors;
export {epochWeek};
