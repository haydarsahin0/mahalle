// Edge functions are deployed from supabase/functions, so the shared game rules and map data
// are copied in rather than imported across the project root. `npm test` fails if the copies
// drift from src/, so there is only ever one source of truth.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
export const SHARED=['src/geometry.js','src/coast.js','src/landuse.js','src/land.js','src/packs.js',
 'public/data/land.json','public/data/landuse.json'];
export const target=file=>'supabase/functions/_shared/'+file.split('/').pop();
export const root=new URL('../',import.meta.url);
export function readPair(file){
 const source=readFileSync(new URL(file,root),'utf8');
 let copy=null;try{copy=readFileSync(new URL(target(file),root),'utf8');}catch{}
 return {source,copy};}
if(import.meta.url===`file://${process.argv[1]}`){
 mkdirSync(new URL('supabase/functions/_shared/',root),{recursive:true});
 for(const file of SHARED)writeFileSync(new URL(target(file),root),readFileSync(new URL(file,root)));
 console.log(`${SHARED.length} dosya supabase/functions/_shared içine kopyalandı.`);}
