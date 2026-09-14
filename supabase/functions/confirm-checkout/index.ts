// Stripe dönüşünde webhook gecikirse ödemeyi güvenli biçimde doğrular ve jetonu yükler.
// Bakiye değişikliği yalnızca Stripe API'den alınan, giriş yapan kullanıcıya ait ve ödenmiş
// Checkout Session için service-role RPC ile yapılır. RPC idempotent olduğundan webhook ile
// aynı oturumun iki kez işlenmesi ek bakiye oluşturmaz.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from './packs.js';

const URL_=Deno.env.get('SUPABASE_URL')!, ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const key=Deno.env.get('STRIPE_SECRET_KEY');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;
const ORIGINS=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());
const cors=(request:Request)=>({
  'Access-Control-Allow-Origin':ORIGINS.includes('*')?'*':(ORIGINS.includes(request.headers.get('origin')||'')?request.headers.get('origin')!:ORIGINS[0]||''),
  'Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS', 'Vary':'Origin'
});
const reply=(body:unknown,request:Request,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'}});

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors(request)});
  if(request.method!=='POST')return reply({error:'POST bekleniyor.'},request,405);
  if(!stripe)return reply({error:'Ödeme altyapısı henüz açılmadı.'},request,503);
  const authorization=request.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return reply({error:'Oturum bulunamadı.'},request,401);
  try{
    const client=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:{user}}=await client.auth.getUser();
    if(!user)return reply({error:'Oturum süresi doldu. Tekrar giriş yap.'},request,401);
    const body=await request.json().catch(()=>({}));
    const sessionId=String(body.session_id||'');
    if(!/^cs_[A-Za-z0-9_]+$/.test(sessionId))return reply({error:'Geçersiz ödeme oturumu.'},request,400);
    const session=await stripe.checkout.sessions.retrieve(sessionId);
    const metadata=session.metadata||{};
    if(String(metadata.user_id||'')!==user.id)return reply({error:'Bu ödeme başka bir hesaba ait.'},request,403);
    if(session.payment_status!=='paid')return reply({status:'pending',message:'Ödeme henüz onaylanmadı.'},request,200);
    if(session.currency!=='try'||!Number.isInteger(session.amount_total)||session.amount_total<=0)
      return reply({error:'Ödeme doğrulanamadı.'},request,400);
    let packId=''; let jetons=0;
    if(metadata.kind==='topup_custom'){
      jetons=Number(metadata.jetons||0);
      if(!Number.isSafeInteger(jetons)||jetons<1||jetons>100000||session.amount_total!==jetons*100)
        return reply({error:'Ödeme tutarı doğrulanamadı.'},request,400);
      packId='custom';
    }else if(metadata.kind==='topup'){
      const pack=packById(String(metadata.pack||''));
      if(!pack||session.amount_total!==pack.kurus)return reply({error:'Paket tutarı doğrulanamadı.'},request,400);
      packId=pack.id; jetons=pack.jetons;
    }else return reply({error:'Bu oturum jeton yükleme oturumu değil.'},request,400);
    const admin=createClient(URL_,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const {data:balance,error}=await admin.rpc('credit_payment',{p_session:session.id,p_user:user.id,p_pack:packId,p_jetons:jetons,p_amount:session.amount_total});
    if(error)throw error;
    return reply({status:'credited',jetons,balance},request,200);
  }catch(error){
    console.error('confirm-checkout',error);
    return reply({error:'Ödeme doğrulanamadı. Birkaç saniye sonra tekrar dene.'},request,502);
  }
});
