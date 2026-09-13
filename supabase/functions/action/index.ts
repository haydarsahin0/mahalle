// Every move a player makes on the map goes through here. The browser only says what it wants
// to do; the price, the zoning and whether the parcel exists are decided on this side, and the
// database function then owns the money.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import {priceOf,floorsFor} from '../_shared/rules.ts';
import {json,fail,preflight} from '../_shared/http.ts';

const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ACTIONS=new Set(['buy','build','upgrade','list','unlist']);
// Best-effort throttle per isolate; the database rules are what actually protect the world.
const seen=new Map<string,{n:number;until:number}>();
function overLimit(key:string,limit=40){const now=Date.now();const hit=seen.get(key);
 if(!hit||hit.until<now){seen.set(key,{n:1,until:now+60000});return false;}
 hit.n++;return hit.n>limit;}

Deno.serve(async request=>{
 const early=preflight(request);if(early)return early;
 if(request.method!=='POST')return fail('POST bekleniyor.',request,405);
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return fail('Lütfen giriş yap.',request,401);
 // Two clients on purpose: the caller's own token proves who they are and reads what row level
 // security lets them read; the service role client is the only thing allowed to move money.
 const supabase=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const admin=createClient(URL_,SERVICE,{auth:{persistSession:false}});
 try{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return fail('Oturum süresi doldu. Tekrar giriş yap.',request,401);
  if(overLimit(user.id))return fail('Çok hızlı gidiyorsun. Bir dakika sonra tekrar dene.',request,429);

  const body=await request.json().catch(()=>({}));
  const action=String(body.action||''),id=String(body.id||'');
  if(!ACTIONS.has(action))return fail('Geçersiz işlem.',request,400);

  const {data:row,error:rowError}=await supabase.from('parcels').select('owner_id,listing,level,building').eq('id',id).maybeSingle();
  if(rowError)throw rowError;
  const price=Number(body.price);
  const {cost,parcel}=priceOf(action,id,row,{type:body.type,price});

  const {data:result,error}=await admin.rpc('commit_action',{
   p_user:user.id,p_action:action,p_parcel:id,p_cost:cost,p_lon:parcel.lon,p_lat:parcel.lat,p_area:parcel.area,
   p_building:action==='build'?String(body.type):null,
   p_max_level:floorsFor(parcel),
   p_price:action==='list'?(Number.isSafeInteger(price)?price:null):null});
  if(error)return fail(error.message.replace(/^.*?:\s*/,''),request,400);

  const {data:profile}=await supabase.from('profiles').select('balance').eq('id',user.id).maybeSingle();
  return json({ok:true,cost,balance:profile?.balance??null,parcel:result},request);
 }catch(error){
  const message=error instanceof Error?error.message:'İşlem tamamlanamadı.';
  return fail(message,request,400);}
});
