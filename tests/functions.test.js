import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {root,MODULES,source,functionDirectories,requiredFor} from '../scripts/sync-functions.mjs';

const read=file=>readFileSync(new URL(file,root),'utf8');

// Panelden ya da CLI ile deploy edilirken yalnızca fonksiyonun kendi klasörü yüklenir:
// eksik bir './packs.js' fonksiyonun hiç ayağa kalkmaması demektir.
test('her edge function klasörü kendi kendine yeterli',()=>{
 const functions=functionDirectories();
 assert.ok(functions.length>=5,'fonksiyonlar bulunamadı');
 for(const fn of functions)
  for(const name of requiredFor(fn))
   assert.ok(existsSync(new URL(`supabase/functions/${fn}/${name}`,root)),
    `supabase/functions/${fn}/${name} eksik — npm run sync çalıştır`);});

// Sunucu ile tarayıcı aynı fiyatı hesaplamalı: kopya eskirse kullanıcıya gösterilen bedelle
// hesaptan düşen bedel ayrışır.
test('fonksiyonlardaki kural kopyaları src ile birebir aynı',()=>{
 for(const fn of functionDirectories())
  for(const name of requiredFor(fn))
   assert.equal(read(`supabase/functions/${fn}/${name}`),read(source(name)),
    `supabase/functions/${fn}/${name} güncel değil — npm run sync çalıştır`);
 for(const name of MODULES)
  assert.equal(read('public/rules/'+name),read(source(name)),
   `public/rules/${name} güncel değil — npm run sync çalıştır`);});

// Ödeme alınıp jeton verilememesi görünmez kalmasın.
test('ödeme fonksiyonları yüklenemeyen oturumu kaydeder',()=>{
 const webhook=read('supabase/functions/stripe-webhook/index.ts');
 assert.match(webhook,/record_payment_issue/,'webhook sorunlu ödemeyi kaydetmeli');
 assert.ok((webhook.match(/await note\(session,/g)||[]).length>=4,'her elenen ödeme yolu iz bırakmalı');
 assert.match(read('supabase/functions/confirm-checkout/index.ts'),/record_payment_issue/,
  'dönüş doğrulaması da yüklenemeyen ödemeyi kaydetmeli');});

test('kurtarma migration dosyası şemada duruyor',()=>{
 const files=readdirSync(new URL('supabase/migrations/',root));
 const recovery=files.find(f=>f.includes('payment_recovery'));
 assert.ok(recovery,'ödeme kurtarma migration dosyası yok');
 const sql=read('supabase/migrations/'+recovery);
 for(const piece of ['ensure_profile','payment_issues','credit_manual','record_payment_issue'])
  assert.match(sql,new RegExp(piece),`${piece} migration içinde yok`);});
