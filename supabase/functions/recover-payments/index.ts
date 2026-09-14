// Dijital Arsam · ödenip yüklenmemiş jetonları kendiliğinden kurtarır.
//
// Webhook hiç kurulmamış, yanlış imzayla kurulmuş ya da bir süre 500 dönmüş olabilir; oyuncu
// ödeme sayfasından döndükten sonra sekmeyi kapatmış da olabilir. Bu fonksiyon, giriş yapan
// oyuncunun son otuz gündeki Stripe oturumlarına bakar, ödenmiş ama veritabanına işlenmemiş
// olanları bulur ve jetonu yükler. Oyuncu yalnızca kendi ödemesini kurtarabilir; tutarı
// webhook ile birebir aynı kurallarla doğrular; credit_payment idempotent olduğu için aynı
// oturum iki kez yüklenmez.
//
// ADMIN_EMAILS listesindeki hesap giriş yaptığında tarama tüm oyuncuları kapsar: sahibi
// sitesine girdiği anda kimde eksik jeton kaldıysa, Stripe'ın tahsil ettiği tutarla yüklenir.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@18.5.0';
import {packById} from 'https://haydarsahin0.github.io/mahalle/rules/packs.js';

const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGINS=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());
const key=Deno.env.get('STRIPE_SECRET_KEY');
const stripe=key?new Stripe(key,{apiVersion:'2025-08-27.basil',httpClient:Stripe.createFetchHttpClient()}):null;
const WINDOW_DAYS=30,PAGES=3,PER_PAGE=100,CUSTOM_MIN=1,CUSTOM_MAX=100000;
const ADMINS=(Deno.env.get('ADMIN_EMAILS')||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
const UUID=/^[0-9a-f-]{36}$/;

const cors=(request:Request)=>{const origin=request.headers.get('origin')||'';
 return {'Access-Control-Allow-Origin':ORIGINS.includes('*')?'*':ORIGINS.includes(origin)?origin:ORIGINS[0]||'',
  'Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};};
const reply=(body:unknown,request:Request,status=200)=>new Response(JSON.stringify(body),
 {status,headers:{...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'}});

// Aynı oyuncu için yirmi saniyede birden fazla tarama yapma: Stripe listesi pahalı bir çağrı.
const lastRun=new Map<string,number>();

// Bir oturumdan kaç jeton çıkacağını, kimin hesabına gideceğini webhook ile aynı kurallarla
// belirler. userId verildiyse yalnızca o hesabın ödemesi kabul edilir.
export function jetonsOf(session:Record<string,any>,userId:string|null){
 if(session.payment_status!=='paid'||session.currency!=='try')return null;
 const owner=String(session.metadata?.user_id||'');
 if(!UUID.test(owner))return null;
 if(userId!==null&&owner!==userId)return null;
 const kind=String(session.metadata?.kind||'');
 if(kind==='topup_custom'){
  const jetons=Number(session.metadata?.jetons||0);
  if(!Number.isSafeInteger(jetons)||jetons<CUSTOM_MIN||jetons>CUSTOM_MAX)return null;
  if(session.amount_total!==jetons*100)return null;
  return {owner,pack:'custom',jetons};}
 if(kind==='topup'||!kind){
  const pack=packById(String(session.metadata?.pack||''));
  if(!pack||session.amount_total!==pack.kurus)return null;
  return {owner,pack:pack.id,jetons:pack.jetons};}
 return null;}

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors(request)});
 if(request.method!=='POST')return reply({error:'POST bekleniyor.'},request,405);
 if(!stripe)return reply({error:'Ödeme altyapısı henüz açılmadı.'},request,503);
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'Lütfen giriş yap.'},request,401);
 try{
  const supabase=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return reply({error:'Oturum süresi doldu. Tekrar giriş yap.'},request,401);

  const now=Date.now();
  if((lastRun.get(user.id)||0)>now-20000)return reply({checked:0,recovered:0,jetons:0},request);
  lastRun.set(user.id,now);
  // Sahibi girdiğinde tarama herkesi kapsar; oyuncu yalnızca kendi ödemesine bakar.
  const admins=ADMINS.includes((user.email||'').toLowerCase());
  const scope=admins?null:user.id;

  const since=Math.floor(now/1000)-WINDOW_DAYS*86400;
  const mine:{id:string;owner:string;pack:string;jetons:number;amount:number}[]=[];
  let startingAfter:string|undefined;
  for(let page=0;page<PAGES;page++){
   const batch=await stripe.checkout.sessions.list({limit:PER_PAGE,created:{gte:since},
    ...(startingAfter?{starting_after:startingAfter}:{})});
   for(const session of batch.data as unknown as Record<string,any>[]){
    const found=jetonsOf(session,scope);
    if(found)mine.push({id:String(session.id),owner:found.owner,pack:found.pack,jetons:found.jetons,amount:Number(session.amount_total)});}
   if(!batch.has_more||!batch.data.length)break;
   startingAfter=batch.data[batch.data.length-1].id;}
  if(!mine.length)return reply({checked:0,recovered:0,jetons:0},request);

  // Zaten yüklenmiş olanları ele. Bu sorgu servis anahtarıyla yapılır: oyuncunun kendi
  // satırlarını görmesi yeterli olmaz, sahibi taramasında başkasının kaydı da görünmeli.
  const admin=createClient(URL_,SERVICE,{auth:{persistSession:false}});
  const {data:known,error:knownError}=await admin.from('payments').select('id').in('id',mine.map(s=>s.id));
  if(knownError)throw knownError;
  const credited=new Set((known||[]).map(row=>row.id));
  const missing=mine.filter(session=>!credited.has(session.id));
  if(!missing.length)return reply({checked:mine.length,recovered:0,jetons:0},request);

  let jetons=0,recovered=0,balance:number|null=null;
  for(const session of missing){
   const {data,error}=await admin.rpc('credit_payment',
    {p_session:session.id,p_user:session.owner,p_pack:session.pack,p_jetons:session.jetons,p_amount:session.amount});
   if(error){
    console.error('kurtarma yüklemesi başarısız',session.id,error.message);
    try{await admin.rpc('record_payment_issue',{p_session:session.id,p_user:session.owner,
     p_reason:'kurtarmada yüklenemedi: '+error.message,p_amount:session.amount,p_currency:'try',
     p_payload:{pack:session.pack,jetons:session.jetons}});}catch{/* yoksay */}
    continue;}
   recovered++;
   // Ekrandaki bakiye yalnızca çağıran kişinin kendi jetonu arttıysa güncellenir.
   if(session.owner===user.id){jetons+=session.jetons;balance=Number(data);}}

  if(recovered)console.log('kurtarılan ödeme',{admin:admins,recovered,jetons});
  return reply({checked:mine.length,recovered,jetons,balance,scope:admins?'herkes':'kendi'},request);
 }catch(error){
  console.error('recover-payments',error);
  return reply({error:'Ödemeler şu an kontrol edilemedi.'},request,502);}
});
