import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PACKS,packById,lira,bonus} from '../src/packs.js';
import {normalizePhone,maskedPhone} from '../src/phone.js';
import {SHARED,readPair} from '../scripts/sync-functions.mjs';
import {setLand,setLanduse,parcelId,parcel,unitPrice,BASE_PRICE,BUILDINGS,upgradePrice,makeState} from '../src/land.js';
setLand(JSON.parse(readFileSync(new URL('../public/data/land.json',import.meta.url))));
setLanduse(JSON.parse(readFileSync(new URL('../public/data/landuse.json',import.meta.url))));

test('jeton packs charge exactly what the price list says',()=>{
 assert.deepEqual(PACKS.map(p=>[p.kurus,p.jetons]),[[10000,100],[40000,500],[99900,1200]]);
 assert.deepEqual(PACKS.map(p=>lira(p.kurus)),[100,400,999]);
 assert.deepEqual(PACKS.map(bonus),[0,25,20]);
 assert.equal(new Set(PACKS.map(p=>p.id)).size,PACKS.length);
 assert.ok(PACKS.every(p=>Number.isSafeInteger(p.kurus)&&Number.isSafeInteger(p.jetons)));
 assert.equal(packById('avantajli').jetons,500);
 assert.equal(packById('bedava'),null);
 assert.equal(packById('__proto__'),null);
 assert.equal(PACKS.filter(p=>p.best).length,1);});

test('one jeton is one lira and a square metre starts at ten kuruş',()=>{
 assert.equal(BASE_PRICE,.1);
 const farm=parcel(parcelId(33.2,38.3));
 assert.equal(farm.value,Math.round(farm.area*.1),'uzak tarla tam 10 kuruş/m²');
 const city=parcel(parcelId(32.8597,39.9334));
 const rate=city.value/city.area;
 assert.ok(rate>BASE_PRICE*2&&rate<BASE_PRICE*12,`şehir merkezi ${rate.toFixed(3)} ₺/m²`);
 // A thousand square metres of remote farmland is a hundred lira, by construction.
 assert.equal(Math.round(1000*unitPrice('field',{pop:0,density:0},0,1)),100);});

test('a new account starts empty and improvements stay affordable next to land',()=>{
 assert.equal(makeState().balance,0);
 const cheapest=PACKS[0].jetons;
 assert.ok(Object.values(BUILDINGS).every(b=>b.cost<=cheapest+60),'yapı bedelleri en küçük paketle karşılanabilir olmalı');
 assert.equal(upgradePrice({level:1}),45);});

test('Turkish mobile numbers are normalized for SMS OTP',()=>{
 assert.equal(normalizePhone('0532 123 45 67'),'+905321234567');
 assert.equal(normalizePhone('+90 (532) 123-45-67'),'+905321234567');
 assert.equal(normalizePhone('0090 532 123 45 67'),'+905321234567');
 assert.equal(maskedPhone('05321234567'),'+90 532 *** ** 67');
 assert.throws(()=>normalizePhone('0212 123 45 67'),/cep telefonu/);
 assert.throws(()=>normalizePhone('555'),/cep telefonu/);});

test('edge functions ship the same rules as the browser',()=>{
 for(const file of SHARED){
  const {source,copy}=readPair(file);
  assert.ok(copy!==null,`${file} kopyası eksik: npm run sync çalıştır`);
  assert.equal(copy,source,`${file} kopyası güncel değil: npm run sync çalıştır`);}});
