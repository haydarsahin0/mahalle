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
const callback=(state:string)=>{const target=new URL(CLIENT_URL);target.searchParams.set('stripe',state);return target.toString();};

async function createSellerAccount(stripe:Stripe,user:any){
 // Express is the most widely supported hosted onboarding path. The platform
 // still owns the application fee and sends the seller's share with a destination
 // transfer from checkout.
 const common={email:user.email||undefined,capabilities:{transfers:{requested:true}},metadata:{supabase_user_id:user.id}};
 try{return await stripe.accounts.create({type:'express',...common} as any);}
 catch(error:any){
  // Some older Connect platforms reject `type` after the controller-properties
  // migration. Retry with the equivalent controller configuration.
  if(!/type|controller|account type/i.test(String(error?.message||'')))throw error;
  return await stripe.accounts.create({
   ...common,
   controller:{stripe_dashboard:{type:'express'},fees:{payer:'application'},losses:{payments:'application'}}
  } as any);
 }
}

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
   const account=await createSellerAccount(stripe,user);
   accountId=account.id;
   const {error}=await admin.from('profiles').update({stripe_account_id:accountId,stripe_onboarding_complete:false}).eq('id',user.id);
   if(error)throw error;
  }
  let account:any;
  try{
   account=await stripe.accounts.retrieve(accountId) as any;
  }catch(error:any){
   // A deleted or mismatched account must not permanently block this seller.
   if(error?.code!=='resource_missing')throw error;
   const replacement=await createSellerAccount(stripe,user);
   accountId=replacement.id;
   const {error:updateError}=await admin.from('profiles').update({stripe_account_id:accountId,stripe_onboarding_complete:false}).eq('id',user.id);
   if(updateError)throw updateError;
   account=replacement;
  }
  const connected=account.capabilities?.transfers==='active';
  const {error:statusError}=await admin.from('profiles').update({stripe_onboarding_complete:connected}).eq('id',user.id);
  if(statusError)throw statusError;
  if(mode==='status')return reply({connected,accountIdLast4:String(accountId).slice(-4)},request);
  const link=await stripe.accountLinks.create({
   account:accountId,
   type:'account_onboarding',
   collect:'eventually_due',
   refresh_url:callback('yenile'),
   return_url:callback('donus')
  });
  return reply({url:link.url,connected},request);
 }catch(error:any){
  console.error('connect-onboarding',error);
  const code=String(error?.code||'');
  const message=String(error?.raw?.message||error?.message||'');
  if(code==='account_country_invalid' || /country.*(support|available)|platform.*country/i.test(message))
   return reply({error:'Stripe bu ülke için satıcı hesabı açılmasına izin vermiyor. Stripe hesabının Connect ayarlarından desteklenen ülkeyi etkinleştir.'},request,422);
  if(/connect.*(disabled|enable)|platform profile|only create.*account|platform.*enabled/i.test(message))
   return reply({error:'Stripe Connect hesabında henüz etkin değil. Stripe Dashboard → Connect → Ayarlar bölümünü tamamla.'},request,422);
  const safe=message.replace(/\s+/g,' ').trim().slice(0,220);
  if(safe)return reply({error:`Stripe işlemi reddetti: ${safe}`},request,502);
  return reply({error:'Stripe satıcı bağlantısı başlatılamadı. Formu kapatıp tekrar dene.'},request,502);
 }
});
