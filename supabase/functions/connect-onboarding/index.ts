// Dijital Arsam · Stripe Connect seller onboarding.
// Secret keys stay in this Edge Function; the browser receives only a short-lived URL.
import {createClient} from 'npm:@supabase/supabase-js@2.45.0';
import Stripe from 'npm:stripe@18.5.0';

const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_URL=Deno.env.get('CLIENT_URL')||'https://haydarsahin0.github.io/mahalle/';
const ORIGINS=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());
const key=Deno.env.get('STRIPE_SECRET_KEY');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;
const cors=(request:Request)=>{const origin=request.headers.get('origin')||'';return {'Access-Control-Allow-Origin':ORIGINS.includes('*')?'*':ORIGINS.includes(origin)?origin:ORIGINS[0]||'','Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};};
const reply=(body:unknown,request:Request,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'}});
const clean=(value:unknown)=>String(value||'').replace(/[^a-zA-Z0-9 .,'&()\-]/g,'').slice(0,80);

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors(request)});
 if(request.method!=='POST')return reply({error:'POST bekleniyor.'},request,405);
 if(!stripe)return reply({error:'Stripe Connect henüz yapılandırılmadı.'},request,503);
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'Satıcı hesabı için giriş yap.'},request,401);
 try{
  const client=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const admin=createClient(URL_,SERVICE,{auth:{persistSession:false}});
  const {data:{user}}=await client.auth.getUser();
  if(!user)return reply({error:'Oturum süresi doldu. Tekrar giriş yap.'},request,401);
  const body=await request.json().catch(()=>({}));
  const mode=String(body.mode||'onboard');
  const {data:profile,error:profileError}=await admin.from('profiles').select('stripe_account_id').eq('id',user.id).maybeSingle();
  if(profileError)throw profileError;
  let accountId=profile?.stripe_account_id as string|undefined;
  if(!accountId){
   // Controller properties are the current migration path for Connect accounts. There is
   // deliberately no legacy `type: express`; the platform owns fees and losses.
   const account=await stripe.accounts.create({
    email:user.email||undefined,
    controller:{stripe_dashboard:{type:'express'},fees:{payer:'application'},losses:{payments:'application'}},
    capabilities:{transfers:{requested:true}},
    metadata:{supabase_user_id:user.id},
    business_profile:{name:clean(user.user_metadata?.full_name||user.email?.split('@')[0]||'Dijital Arsam satıcısı')}
   } as any);
   accountId=account.id;
   const {error}=await admin.from('profiles').update({stripe_account_id:accountId,stripe_onboarding_complete:false}).eq('id',user.id);
   if(error)throw error;
  }
  const account=await stripe.accounts.retrieve(accountId) as any;
  const connected=account.capabilities?.transfers==='active';
  const {error:statusError}=await admin.from('profiles').update({stripe_onboarding_complete:connected}).eq('id',user.id);
  if(statusError)throw statusError;
  if(mode==='status')return reply({connected,accountIdLast4:String(accountId).slice(-4)},request);
  const link=await stripe.accountLinks.create({
   account:accountId,
   type:'account_onboarding',
   collect:'eventually_due',
   refresh_url:CLIENT_URL+'?stripe=yenile',
   return_url:CLIENT_URL+'?stripe=donus'
  });
  return reply({url:link.url,connected},request);
 }catch(error){
  console.error('connect-onboarding',error);
  return reply({error:'Stripe satıcı bağlantısı başlatılamadı. Lütfen bilgilerini kontrol edip tekrar dene.'},request,502);
 }
});
