// Dijital Arsam · Stripe Checkout oturumu açar.
// Burada bakiye değişmez: jeton yalnızca stripe-webhook fonksiyonunda, ödeme onaylandıktan
// sonra yüklenir.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from 'https://haydarsahin0.github.io/mahalle/rules/packs.js';

const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const CLIENT_URL=Deno.env.get('CLIENT_URL')||'';
const ORIGINS=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());
const key=Deno.env.get('STRIPE_SECRET_KEY');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;

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
  const {pack:packId}=await request.json().catch(()=>({}));
  const pack=packById(String(packId||''));
  if(!pack)return reply({error:'Geçersiz paket.'},request,400);

  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   customer_email:user.email??undefined,
   line_items:[{quantity:1,price_data:{currency:'try',unit_amount:pack.kurus,product_data:{
    name:`Dijital Arsam · ${pack.jetons} jeton`,
    description:'Oyun içi jeton. Nakde çevrilemez, gerçek taşınmaz hakkı vermez.'}}}],
   metadata:{user_id:user.id,pack:pack.id,jetons:String(pack.jetons)},
   success_url:CLIENT_URL+'?odeme=tamam',
   cancel_url:CLIENT_URL+'?odeme=iptal'});
  return reply({url:session.url},request);
 }catch(error){
  console.error('checkout',error);
  return reply({error:'Ödeme başlatılamadı. Lütfen tekrar dene.'},request,502);}
});
