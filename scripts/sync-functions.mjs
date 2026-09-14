// Oyun kuralları tek yerde yazılır (src/) ve tek yerde yayınlanır: public/rules/.
// Edge function'lar bu adresten import eder, tarayıcı da aynı dosyaları kullanır; böylece
// sunucu ile ekran aynı fiyatı hesaplar. Fonksiyon klasörlerinde kopya tutulmaz — kopya
// tutulduğu dönemde biri eksik kaldı ve ödeme doğrulaması hiç ayağa kalkmadı.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';

export const root=new URL('../',import.meta.url);
export const MODULES=['geometry.js','coast.js','landuse.js','land.js','packs.js'];
export const RULES_URL='https://haydarsahin0.github.io/mahalle/rules/';
export const source=name=>'src/'+name;
const read=file=>readFileSync(new URL(file,root),'utf8');

export function functionDirectories(){
 const base=new URL('supabase/functions/',root);
 if(!existsSync(base))return [];
 return readdirSync(base,{withFileTypes:true})
  .filter(entry=>entry.isDirectory()&&existsSync(new URL(entry.name+'/index.ts',base)))
  .map(entry=>entry.name);}

export const filesIn=fn=>readdirSync(new URL(`supabase/functions/${fn}/`,root));
export const importsOf=fn=>[...read(`supabase/functions/${fn}/index.ts`)
 .matchAll(/from\s+'([^']+)'/g)].map(match=>match[1]);

if(import.meta.url===`file://${process.argv[1]}`){
 mkdirSync(new URL('public/rules/',root),{recursive:true});
 for(const name of MODULES)writeFileSync(new URL('public/rules/'+name,root),read(source(name)));
 console.log(`${MODULES.length} kural dosyası public/rules/ içine kopyalandı.`);}
