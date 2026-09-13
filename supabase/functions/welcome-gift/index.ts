// Gives an authenticated player exactly one random, currently unowned parcel.
// The database lock is the final authority, so concurrent tabs cannot win twice.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import {setLand,setLanduse,parcelId,parcel,validParcel}
 from './land.js';

const SITE=Deno.env.get('DATA_BASE_URL')||'https://haydarsahin0.github.io/mahalle/';
const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGINS=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());
const ready=(async()=>{
 const [land,landuse]=await Promise.all([
  fetch(SITE+'data/land.json').then(r=>r.json()),fetch(SITE+'data/landuse.json').then(r=>r.json())]);
 if(!setLand(land)||!setLanduse(landuse))throw new Error('Harita verisi yüklenemedi.');})();

const cors=(request:Request)=>{const origin=request.headers.get('origin')||'';
 return {'Access-Control-Allow-Origin':ORIGINS.includes('*')?'*':ORIGINS.includes(origin)?origin:ORIGINS[0]||'',
  'Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};};
const reply=(body:unknown,request:Request,status=200)=>new Response(JSON.stringify(body),
 {status,headers:{...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'}});
const random=()=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;};

// Turkey's bounding box is sampled cryptographically. The real land and water data then
// rejects sea, lakes and foreign territory; duplicate generated parcel ids are removed.
function candidates(){
 const found=new Map<string,{id:string;lon:number;lat:number;area:number}>();
 for(let attempt=0;attempt<320&&found.size<64;attempt++){
  const lon=25.55+random()*(44.85-25.55),lat=35.82+random()*(42.10-35.82);
  const id=parcelId(lon,lat);
  if(!id||found.has(id)||!validParcel(id))continue;
  const p=parcel(id);
  found.set(id,{id:p.id,lon:p.lon,lat:p.lat,area:p.area});
 }
 return [...found.values()];
}

const seen=new Map<string,number>();
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors(request)});
 if(request.method!=='POST')return reply({error:'POST bekleniyor.'},request,405);
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'Lütfen giriş yap.'},request,401);
 try{
  await ready;
  const supabase=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const admin=createClient(URL_,SERVICE,{auth:{persistSession:false}});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return reply({error:'Oturum süresi doldu. Tekrar giriş yap.'},request,401);
  const now=Date.now(),last=seen.get(user.id)||0;
  if(now-last<3000)return reply({error:'Çarkı yeniden çevirmek için birkaç saniye bekle.'},request,429);
  seen.set(user.id,now);
  const list=candidates();
  if(!list.length)return reply({error:'Hediye için uygun bir parsel bulunamadı. Tekrar dene.'},request,503);
  const {data,error}=await admin.rpc('claim_welcome_gift',{p_user:user.id,p_candidates:list});
  if(error)return reply({error:error.message.replace(/^.*?:\s*/,'')},request,400);
  return reply({ok:true,parcel:data.parcel,wasNew:data.was_new},request);
 }catch(error){
  console.error('welcome-gift',error);
  return reply({error:error instanceof Error?error.message:'Hediye verilemedi.'},request,500);}
});
