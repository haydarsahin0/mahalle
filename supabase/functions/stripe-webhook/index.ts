// The only place jetons are created. Deploy with --no-verify-jwt: Stripe calls it, not a
// browser, and the signature below is what proves the call is genuine.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from '../_shared/packs.js';

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
   const pack=packById(String(session.metadata?.pack||''));
   const userId=String(session.metadata?.user_id||'');
   // A session only credits jetons if it is paid, in lira, for the exact price of a real pack.
   const genuine=session.payment_status==='paid'&&pack&&session.currency==='try'
    &&session.amount_total===pack.kurus&&/^[0-9a-f-]{36}$/.test(userId);
   if(!genuine){console.error('unexpected checkout payload',session.id);return new Response('ignored',{status:200});}
   const {error}=await admin.rpc('credit_payment',
    {p_session:session.id,p_user:userId,p_pack:pack.id,p_jetons:pack.jetons,p_amount:pack.kurus});
   if(error)throw error;}
  return new Response(JSON.stringify({received:true}),{status:200,headers:{'Content-Type':'application/json'}});
 }catch(error){
  console.error('webhook',error);
  return new Response('retry later',{status:500});}   // Stripe retries on 5xx
});
