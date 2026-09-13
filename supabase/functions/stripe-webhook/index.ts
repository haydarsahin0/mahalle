// Dijital Arsam · jetonun var olduğu tek yer.
// --no-verify-jwt ile deploy edilir: bunu tarayıcı değil Stripe çağırır ve çağrının gerçek
// olduğunu aşağıdaki imza doğrulaması kanıtlar.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from './packs.js';

const key=Deno.env.get('STRIPE_SECRET_KEY'),secret=Deno.env.get('STRIPE_WEBHOOK_SECRET');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const PAID=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded']);

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
   const pack=packById(String(session.metadata?.pack||''));
   const userId=String(session.metadata?.user_id||'');
   // Yalnızca ödenmiş, lira cinsinden ve gerçek bir paketin tam fiyatına eşit oturum jeton yükler.
   const genuine=session.payment_status==='paid'&&pack&&session.currency==='try'
    &&session.amount_total===pack.kurus&&/^[0-9a-f-]{36}$/.test(userId);
   if(!genuine){console.error('unexpected checkout payload',session.id);return new Response('ignored',{status:200});}
   const {error}=await admin.rpc('credit_payment',
    {p_session:session.id,p_user:userId,p_pack:pack.id,p_jetons:pack.jetons,p_amount:pack.kurus});
   if(error)throw error;}
  if(event.type==='checkout.session.expired'){
   const session=event.data.object as Record<string,any>;
   if(session.metadata?.kind==='parcel_sale'){
    const {error}=await admin.rpc('cancel_marketplace_sale',{p_session:session.id,p_status:'cancelled'});
    if(error)throw error;
   }
  }
  return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});
 }catch(error){
  console.error('webhook',error);
  return new Response('retry later',{status:500});}   // 5xx: Stripe tekrar dener
});
