// Starts a Stripe Checkout session for one jeton pack. No balance changes here: only the
// webhook, after Stripe confirms the money arrived, may credit jetons.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from '../_shared/packs.js';
import {json,fail,preflight} from '../_shared/http.ts';

const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const CLIENT_URL=Deno.env.get('CLIENT_URL')||'';
const key=Deno.env.get('STRIPE_SECRET_KEY');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;

Deno.serve(async request=>{
 const early=preflight(request);if(early)return early;
 if(request.method!=='POST')return fail('POST bekleniyor.',request,405);
 if(!stripe||!CLIENT_URL)return fail('Ödeme altyapısı henüz açılmadı.',request,503);
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return fail('Jeton almak için giriş yap.',request,401);
 const supabase=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 try{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return fail('Oturum süresi doldu. Tekrar giriş yap.',request,401);
  const {pack:packId}=await request.json().catch(()=>({}));
  const pack=packById(String(packId||''));
  if(!pack)return fail('Geçersiz paket.',request,400);

  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   customer_email:user.email??undefined,
   line_items:[{quantity:1,price_data:{currency:'try',unit_amount:pack.kurus,product_data:{
    name:`Dijital Arsam · ${pack.jetons} jeton`,
    description:'Oyun içi jeton. Nakde çevrilemez, gerçek taşınmaz hakkı vermez.'}}}],
   metadata:{user_id:user.id,pack:pack.id,jetons:String(pack.jetons)},
   success_url:CLIENT_URL+'?odeme=tamam',
   cancel_url:CLIENT_URL+'?odeme=iptal'});
  return json({url:session.url},request);
 }catch(error){
  console.error('checkout',error);
  return fail('Ödeme başlatılamadı. Lütfen tekrar dene.',request,502);}
});
