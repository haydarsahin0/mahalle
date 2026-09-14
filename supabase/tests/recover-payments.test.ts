// Kurtarma fonksiyonunun para doğrulaması: kim, ne kadar, hangi koşulda.
// deno run --allow-net --allow-env --allow-import=... supabase/tests/recover-payments.test.ts
import {jetonsOf} from '../functions/recover-payments/index.ts';

const AYSE='11111111-1111-1111-1111-111111111111',BURAK='22222222-2222-2222-2222-222222222222';
const session=(over:Record<string,unknown>={})=>({
 id:'cs_test',payment_status:'paid',currency:'try',amount_total:40000,
 metadata:{kind:'topup',user_id:AYSE,pack:'avantajli'},...over});

let failed=0;
const check=(name:string,ok:boolean)=>{if(!ok)failed++;console.log(`${ok?'ok  ':'HATA'} ${name}`);};

check('paket ödemesi doğru jetonu verir',
 JSON.stringify(jetonsOf(session(),AYSE))===JSON.stringify({owner:AYSE,pack:'avantajli',jetons:500}));
check('serbest yükleme doğru jetonu verir',
 JSON.stringify(jetonsOf(session({amount_total:6000,metadata:{kind:'topup_custom',user_id:AYSE,jetons:'60'}}),AYSE))
 ===JSON.stringify({owner:AYSE,pack:'custom',jetons:60}));
check('başkasının ödemesi kurtarılamaz',jetonsOf(session(),BURAK)===null);
check('tutarı düşürülmüş paket reddedilir',jetonsOf(session({amount_total:100}),AYSE)===null);
check('serbest yüklemede tutar jetonla eşleşmeli',
 jetonsOf(session({amount_total:100,metadata:{kind:'topup_custom',user_id:AYSE,jetons:'60'}}),AYSE)===null);
check('ödenmemiş oturum reddedilir',jetonsOf(session({payment_status:'unpaid'}),AYSE)===null);
check('lira dışı para birimi reddedilir',jetonsOf(session({currency:'usd'}),AYSE)===null);
check('bilinmeyen paket reddedilir',
 jetonsOf(session({metadata:{kind:'topup',user_id:AYSE,pack:'bedava'}}),AYSE)===null);
check('parsel satışı jeton yüklemesi sayılmaz',
 jetonsOf(session({metadata:{kind:'parcel_sale',user_id:AYSE}}),AYSE)===null);
check('kullanıcısı olmayan oturum reddedilir',jetonsOf(session({metadata:{kind:'topup',pack:'avantajli'}}),AYSE)===null);
// Sahibi taramasında (userId null) ödeme, oturumun kendi sahibine yazılır.
check('sahibi taramasında ödeme kendi sahibine gider',
 (jetonsOf(session({metadata:{kind:'topup',user_id:BURAK,pack:'avantajli'}}),null) as {owner:string}|null)?.owner===BURAK);

console.log(failed?`${failed} kontrol başarısız`:'kurtarma doğrulaması geçti');
Deno.exit(failed?1:0);
