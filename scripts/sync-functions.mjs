// Oyun kuralları tek yerde yazılır (src/), iki yere kopyalanır:
//   • public/rules/  → yayınlanan site, tarayıcı ve uzaktan import için
//   • supabase/functions/<fn>/ → edge function klasörleri kendi kendine yeterli olmalı,
//     çünkü panelden ya da CLI ile deploy edilirken yalnızca o klasör yüklenir.
// Bir fonksiyonun index.ts'i './packs.js' diyorsa o dosya klasörde yoksa fonksiyon hiç
// ayağa kalkmaz; `npm test` bunu yakalar, bu betik de düzeltir.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';

export const root=new URL('../',import.meta.url);
export const MODULES=['geometry.js','coast.js','landuse.js','land.js','packs.js'];
export const source=name=>'src/'+name;
const read=file=>readFileSync(new URL(file,root),'utf8');
const localImports=text=>[...text.matchAll(/from\s+'\.\/([^']+)'/g)].map(m=>m[1]);

// Bir modül başka modülleri çağırıyorsa onlar da aynı klasöre gitmeli.
export function withDependencies(names,seen=new Set()){
 for(const name of names){
  if(seen.has(name))continue;
  if(!MODULES.includes(name))continue;
  seen.add(name);
  withDependencies(localImports(read(source(name))),seen);}
 return [...seen];}

export function functionDirectories(){
 const base=new URL('supabase/functions/',root);
 if(!existsSync(base))return [];
 return readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&existsSync(new URL(e.name+'/index.ts',base)))
  .map(e=>e.name);}

// Bir fonksiyonun klasöründe bulunması gereken kural dosyaları.
export function requiredFor(fn){
 return withDependencies(localImports(read(`supabase/functions/${fn}/index.ts`)));}

if(import.meta.url===`file://${process.argv[1]}`){
 mkdirSync(new URL('public/rules/',root),{recursive:true});
 for(const name of MODULES)writeFileSync(new URL('public/rules/'+name,root),read(source(name)));
 let copied=0;
 for(const fn of functionDirectories()){
  for(const name of requiredFor(fn)){
   writeFileSync(new URL(`supabase/functions/${fn}/${name}`,root),read(source(name)));copied++;}}
 console.log(`${MODULES.length} dosya public/rules/ içine, ${copied} dosya fonksiyon klasörlerine kopyalandı.`);}
