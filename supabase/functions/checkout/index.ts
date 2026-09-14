// Dijital Arsam · Stripe Checkout oturumu açar.
// Burada bakiye değişmez: jeton yalnızca stripe-webhook fonksiyonunda, ödeme onaylandıktan
// sonra yüklenir.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from 'https://haydarsahin0.github.io/mahalle/rules/packs.js';

const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const CLIENT_URL=Deno.env.get('CLIENT_URL')||'https://haydarsahin0.github.io/mahalle/';
const ORIGINS=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());
const key=Deno.env.get('STRIPE_SECRET_KEY');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;
const CUSTOM_MIN=1,CUSTOM_MAX=100000;

const cors=(request:Request)=>{const origin=request.headers.get('origin')||'';
 return {'Access-Control-Allow-Origin':ORIGINS.includes('*')?'*':ORIGINS.includes(origin)?origin:ORIGINS[0]||'',
  'Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};};
const reply=(body:unknown,request:Request,status=200)=>new Response(JSON.stringify(body),
 {status,headers:{...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'}});

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors(request)});
 if(request.method!=='POST')return reply({error:'POST bekleniyor.'},request,405);
 if(!stripe||!CLIENT_URL)return reply({error:'Ödeme altyapısı henüz açılmadı.'},request,503);
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'Jeton almak için giriş yap.'},request,401);
 try{
  const supabase=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return reply({error:'Oturum süresi doldu. Tekrar giriş yap.'},request,401);
  const body=await request.json().catch(()=>({}));
  const parcelId=String(body.parcel||'');
  if(parcelId){
   const admin=createClient(URL_,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
   // RPC dönüşü şemasız geldiği için satışın alanlarını burada adlandırıyoruz.
   type Sale={id:string;seller_id:string;amount_kurus:number;commission_kurus:number;price_tokens:number};
   const {data,error:reserveError}=await admin.rpc('reserve_marketplace_sale',{p_buyer:user.id,p_parcel:parcelId}).maybeSingle();
   const sale=data as Sale|null;
   if(reserveError||!sale)return reply({error:reserveError?.message?.replace(/^.*?:\s*/,'')||'Bu parsel artık satışta değil.'},request,409);
   const {data:seller,error:sellerError}=await admin.from('profiles').select('stripe_account_id,stripe_onboarding_complete').eq('id',sale.seller_id).maybeSingle();
   if(sellerError)throw sellerError;
   if(!seller?.stripe_account_id||!seller.stripe_onboarding_complete){
    await admin.from('marketplace_sales').update({status:'failed'}).eq('id',sale.id).eq('status','pending');
    return reply({error:'Satıcının Stripe hesabı henüz hazır değil.'},request,409);
   }
   let session;
   try{session=await stripe.checkout.sessions.create({
    mode:'payment',
    customer_email:user.email??undefined,
    line_items:[{quantity:1,price_data:{currency:'try',unit_amount:Number(sale.amount_kurus),product_data:{
     name:`Dijital Arsam · Parsel ${parcelId}`,
     description:'Dijital oyun parseli. Gerçek taşınmaz hakkı vermez.'}}}],
    payment_intent_data:{
     application_fee_amount:Number(sale.commission_kurus),
     transfer_data:{destination:seller.stripe_account_id},
     metadata:{sale_id:sale.id,parcel_id:parcelId}
    },
    metadata:{kind:'parcel_sale',sale_id:sale.id,parcel_id:parcelId,buyer_id:user.id,seller_id:sale.seller_id},
    // Stripe replaces this placeholder with the real session id. The client uses it
    // as a second, signed confirmation path when webhook delivery is delayed.
    success_url:CLIENT_URL+'?satis=tamam&session_id={CHECKOUT_SESSION_ID}',
    cancel_url:CLIENT_URL+'?satis=iptal'
   });}catch(error){
    await admin.from('marketplace_sales').update({status:'failed'}).eq('id',sale.id).eq('status','pending');
    throw error;
   }
   const {error:updateError}=await admin.from('marketplace_sales').update({stripe_session_id:session.id}).eq('id',sale.id).eq('status','pending');
   if(updateError)throw updateError;
   return reply({url:session.url,commissionTokens:Math.floor(Number(sale.price_tokens)*.1),sellerTokens:Number(sale.price_tokens)-Math.floor(Number(sale.price_tokens)*.1)},request);
  }
  const custom=Number(body.customAmount);
  if(body.customAmount!==undefined){
   if(!Number.isSafeInteger(custom)||custom<CUSTOM_MIN||custom>CUSTOM_MAX)
    return reply({error:`Serbest miktar ${CUSTOM_MIN}–${CUSTOM_MAX} jeton arasında tam sayı olmalı.`},request,400);
   const session=await stripe.checkout.sessions.create({
    mode:'payment',
    customer_email:user.email??undefined,
    line_items:[{quantity:1,price_data:{currency:'try',unit_amount:custom*100,product_data:{
     name:`Dijital Arsam · ${custom} jeton`,
     description:'Oyun içi jeton. Nakde çevrilemez, gerçek taşınmaz hakkı vermez.'}}}],
    metadata:{kind:'topup_custom',user_id:user.id,pack:'custom',jetons:String(custom)},
    success_url:CLIENT_URL+'?odeme=tamam&session_id={CHECKOUT_SESSION_ID}',
    cancel_url:CLIENT_URL+'?odeme=iptal'});
   return reply({url:session.url},request);
  }
  const pack=packById(String(body.pack||''));
  if(!pack)return reply({error:'Geçersiz paket.'},request,400);
  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   customer_email:user.email??undefined,
   line_items:[{quantity:1,price_data:{currency:'try',unit_amount:pack.kurus,product_data:{
    name:`Dijital Arsam · ${pack.jetons} jeton`,
    description:'Oyun içi jeton. Nakde çevrilemez, gerçek taşınmaz hakkı vermez.'}}}],
   metadata:{kind:'topup',user_id:user.id,pack:pack.id,jetons:String(pack.jetons)},
   success_url:CLIENT_URL+'?odeme=tamam&session_id={CHECKOUT_SESSION_ID}',
   cancel_url:CLIENT_URL+'?odeme=iptal'});
  return reply({url:session.url},request);
 }catch(error){
  console.error('checkout',error);
  return reply({error:'Ödeme başlatılamadı. Lütfen tekrar dene.'},request,502);}
});
