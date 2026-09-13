// The edge functions import the game rules straight from the published site, so the browser and
// the server can never disagree about a price. This copies the modules into public/rules/ where
// the build publishes them; `npm test` fails if the copies drift from src/.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
export const SHARED=['src/geometry.js','src/coast.js','src/landuse.js','src/land.js','src/packs.js'];
export const target=file=>'public/rules/'+file.split('/').pop();
export const root=new URL('../',import.meta.url);
export function readPair(file){
 const source=readFileSync(new URL(file,root),'utf8');
 let copy=null;try{copy=readFileSync(new URL(target(file),root),'utf8');}catch{}
 return {source,copy};}
if(import.meta.url===`file://${process.argv[1]}`){
 mkdirSync(new URL('public/rules/',root),{recursive:true});
 for(const file of SHARED)writeFileSync(new URL(target(file),root),readFileSync(new URL(file,root)));
 console.log(`${SHARED.length} kural dosyası public/rules/ içine kopyalandı.`);}
