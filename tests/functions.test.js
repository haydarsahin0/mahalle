import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {root,MODULES,RULES_URL,source,functionDirectories,filesIn,importsOf} from '../scripts/sync-functions.mjs';

const read=file=>readFileSync(new URL(file,root),'utf8');
const functions=functionDirectories();

// Deploy sırasında yalnızca fonksiyonun kendi klasörü yüklenir. Kardeş dosyaya bağımlılık
// kurulduğu sürece o dosyanın unutulması mümkündür; confirm-checkout tam olarak böyle
// kırılmış, ödemeler yüklenmeden kalmıştı. Artık tek dosya kuralı var.
test('her edge function tek dosyadır ve kardeş dosyaya bağımlı değildir',()=>{
 assert.ok(functions.length>=6,'fonksiyonlar bulunamadı');
 for(const fn of functions){
  assert.deepEqual(filesIn(fn),['index.ts'],`supabase/functions/${fn} tek dosya olmalı`);
  for(const specifier of importsOf(fn))
   assert.ok(!specifier.startsWith('./')&&!specifier.startsWith('../'),
    `${fn}/index.ts kardeş dosya çağırıyor: ${specifier}`);}});

// Sunucu ile tarayıcı aynı kuralı okumalı: fonksiyonların import ettiği her kural dosyası
// yayınlanmış olmalı ve src/ ile birebir aynı kalmalı.
test('fonksiyonların kullandığı kurallar yayınlanmış ve güncel',()=>{
 const used=new Set();
 for(const fn of functions)
  for(const specifier of importsOf(fn))
   if(specifier.startsWith(RULES_URL))used.add(specifier.slice(RULES_URL.length));
 assert.ok(used.size>0,'hiçbir fonksiyon yayınlanan kuralları kullanmıyor');
 for(const name of used){
  assert.ok(MODULES.includes(name),`${name} yayınlanan kural listesinde yok`);
  assert.equal(read('public/rules/'+name),read(source(name)),
   `public/rules/${name} güncel değil — npm run sync çalıştır`);}
 for(const name of MODULES)
  assert.equal(read('public/rules/'+name),read(source(name)),
   `public/rules/${name} güncel değil — npm run sync çalıştır`);});

test('ödeme fonksiyonları yüklenemeyen oturumu kaydeder',()=>{
 const webhook=read('supabase/functions/stripe-webhook/index.ts');
 assert.match(webhook,/record_payment_issue/,'webhook sorunlu ödemeyi kaydetmeli');
 assert.ok((webhook.match(/await note\(session,/g)||[]).length>=4,'her elenen ödeme yolu iz bırakmalı');
 assert.match(read('supabase/functions/confirm-checkout/index.ts'),/record_payment_issue/,
  'dönüş doğrulaması da yüklenemeyen ödemeyi kaydetmeli');});

// Webhook hiç ulaşmasa bile ödeme kaybolmamalı.
test('kayıp ödemeler kendiliğinden kurtarılır',()=>{
 assert.ok(functions.includes('recover-payments'),'kurtarma fonksiyonu yok');
 const recover=read('supabase/functions/recover-payments/index.ts');
 assert.match(recover,/checkout\.sessions\.list/,'Stripe oturumları taranmalı');
 assert.match(recover,/credit_payment/,'bulunan ödeme yüklenmeli');
 assert.match(recover,/ADMIN_EMAILS/,'sahibi girişinde tarama herkesi kapsamalı');
 assert.match(read('src/main.js'),/recoverLostPayments\(\)/,'istemci girişten sonra kurtarmayı çağırmalı');
 assert.match(read('src/api.js'),/recover-payments/,'istemcide kurtarma çağrısı tanımlı olmalı');});

test('kurtarma migration dosyası şemada duruyor',()=>{
 const sql=read('supabase/migrations/20260914120000_payment_recovery.sql');
 for(const piece of ['ensure_profile','payment_issues','credit_manual','record_payment_issue'])
  assert.match(sql,new RegExp(piece),`${piece} migration içinde yok`);});
