// Dijital Arsam · jetonun var olduğu tek yer.
// --no-verify-jwt ile deploy edilir: bunu tarayıcı değil Stripe çağırır ve çağrının gerçek
// olduğunu aşağıdaki imza doğrulaması kanıtlar.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from 'https://haydarsahin0.github.io/mahalle/rules/packs.js';

const key=Deno.env.get('STRIPE_SECRET_KEY'),secret=Deno.env.get('STRIPE_WEBHOOK_SECRET');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const PAID=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded']);

// Ödenmiş ama yüklenemeyen her oturum iz bırakır: para alınıp jeton verilmemesi görünmez
// kalmasın, sonradan tek komutla telafi edilebilsin.
async function note(session:Record<string,any>,reason:string){
 try{
  await admin.rpc('record_payment_issue',{
   p_session:String(session.id||''),
   p_user:/^[0-9a-f-]{36}$/.test(String(session.metadata?.user_id||''))?String(session.metadata.user_id):null,
   p_reason:reason,
   p_amount:Number.isInteger(session.amount_total)?session.amount_total:null,
   p_currency:session.currency??null,
   p_payload:{kind:session.metadata?.kind??null,pack:session.metadata?.pack??null,
    jetons:session.metadata?.jetons??null,payment_status:session.payment_status??null}});
 }catch(error){console.error('payment issue kaydedilemedi',error);}
}
const CUSTOM_MIN=1,CUSTOM_MAX=100000;

Deno.serve(async request=>{
 if(!stripe||!secret)return new Response('payments disabled',{status:503});
 const signature=request.headers.get('stripe-signature');
 if(!signature)return new Response('missing signature',{status:400});
 let event;
 try{event=await stripe.webhooks.constructEventAsync(await request.text(),signature,secret);}
 catch(error){console.error('signature',error);return new Response('invalid signature',{status:400});}

 try{
  if(PAID.has(event.type)){
   const session=event.data.object as Record<string,any>;
   if(session.metadata?.kind==='parcel_sale'){
    const saleId=String(session.metadata?.sale_id||'');
    const paymentIntent=typeof session.payment_intent==='string'?session.payment_intent:null;
    if(session.payment_status!=='paid'||!saleId)return new Response('ignored',{status:200});
    // The Checkout Session was created by our server with destination charges. The SQL
    // function locks the listing and changes ownership exactly once.
    const {error}=await admin.rpc('settle_marketplace_sale',{p_session:session.id,p_payment_intent:paymentIntent});
    if(error)throw error;
    return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});
   }
   const userId=String(session.metadata?.user_id||'');
   if(session.metadata?.kind==='topup_custom'){
    const jetons=Number(session.metadata?.jetons||0);
    const genuine=session.payment_status==='paid'&&session.currency==='try'
     &&Number.isSafeInteger(jetons)&&jetons>=CUSTOM_MIN&&jetons<=CUSTOM_MAX
     &&session.amount_total===jetons*100&&/^[0-9a-f-]{36}$/.test(userId);
    if(!genuine){
     console.error('unexpected custom checkout payload',session.id);
     if(session.payment_status==='paid')await note(session,'serbest yükleme doğrulanamadı');
     return new Response('ignored',{status:200});}
    const {error}=await admin.rpc('credit_payment',
     {p_session:session.id,p_user:userId,p_pack:'custom',p_jetons:jetons,p_amount:jetons*100});
    if(error){await note(session,'jeton yüklenemedi: '+error.message);throw error;}
    return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});
   }
   const pack=packById(String(session.metadata?.pack||''));
   // Yalnızca ödenmiş, lira cinsinden ve gerçek bir paketin tam fiyatına eşit oturum jeton yükler.
   const genuine=session.payment_status==='paid'&&pack&&session.currency==='try'
    &&session.amount_total===pack.kurus&&/^[0-9a-f-]{36}$/.test(userId);
   if(!genuine){
    console.error('unexpected checkout payload',session.id);
    if(session.payment_status==='paid')await note(session,pack?'paket tutarı eşleşmedi':'paket tanınmadı');
    return new Response('ignored',{status:200});}
   const {error}=await admin.rpc('credit_payment',
    {p_session:session.id,p_user:userId,p_pack:pack.id,p_jetons:pack.jetons,p_amount:pack.kurus});
   if(error){await note(session,'jeton yüklenemedi: '+error.message);throw error;}}
 if(event.type==='checkout.session.expired'){
   const session=event.data.object as Record<string,any>;
   if(session.metadata?.kind==='parcel_sale'){
    const {error}=await admin.rpc('cancel_marketplace_sale',{p_session:session.id,p_status:'cancelled'});
    if(error)throw error;
   }
  }
  if(event.type==='account.updated'){
   const account=event.data.object as Record<string,any>;
   const userId=String(account.metadata?.supabase_user_id||'');
   if(/^[0-9a-f-]{36}$/.test(userId)){
    const connected=account.capabilities?.transfers==='active';
    const {error}=await admin.from('profiles').update({stripe_onboarding_complete:connected}).eq('id',userId);
    if(error)throw error;
   }
  }
  return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});
 }catch(error){
  console.error('webhook',error);
  return new Response('retry later',{status:500});}   // 5xx: Stripe tekrar dener
});
