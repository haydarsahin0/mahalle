// Dijital Arsam · her oyun hamlesi buradan geçer.
// Tarayıcı ne istediğini söyler; parselin var olup olmadığına, imarına ve fiyatına bu taraf
// karar verir, parayı da veritabanı fonksiyonu taşır. İstemciden gelen hiçbir tutara güvenilmez.
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
// Kurallar yayındaki siteden gelir: tarayıcı ile sunucu aynı kodu kullanır.
// Kuralları değiştirdiğinde bu fonksiyonu yeniden deploy et (kod deploy anında paketlenir).
import {setLand,setLanduse,validParcel,parcel,canBuild,upgradePrice,epochWeek,BUILDINGS,ZONES}
 from 'https://haydarsahin0.github.io/mahalle/rules/land.js';
// Oyun kuralları sade JavaScript; TypeScript'e sözlük olduklarını söylüyoruz.
const buildings=BUILDINGS as Record<string,{cost:number;name:string}>;
const zones=ZONES as Record<string,{floors:number}>;

const SITE=Deno.env.get('DATA_BASE_URL')||'https://haydarsahin0.github.io/mahalle/';
const URL_=Deno.env.get('SUPABASE_URL')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORIGINS=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());
const ACTIONS=new Set(['buy','build','upgrade','list','unlist']);

// Harita verisi ilk çağrıda indirilir, sonra sıcak kalır.
const ready=(async()=>{
 const [land,landuse]=await Promise.all([
  fetch(SITE+'data/land.json').then(r=>r.json()),
  fetch(SITE+'data/landuse.json').then(r=>r.json())]);
 if(!setLand(land)||!setLanduse(landuse))throw new Error('Harita verisi yüklenemedi.');})();

const cors=(request:Request)=>{const origin=request.headers.get('origin')||'';
 return {'Access-Control-Allow-Origin':ORIGINS.includes('*')?'*':ORIGINS.includes(origin)?origin:ORIGINS[0]||'',
  'Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};};
const reply=(body:unknown,request:Request,status=200)=>new Response(JSON.stringify(body),
 {status,headers:{...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'}});

// Çağrı başına en fazla 40 işlem; asıl koruma veritabanı kurallarıdır.
const seen=new Map<string,{n:number;until:number}>();
const overLimit=(key:string)=>{const now=Date.now(),hit=seen.get(key);
 if(!hit||hit.until<now){seen.set(key,{n:1,until:now+60000});return false;}
 return ++hit.n>40;};

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors(request)});
 if(request.method!=='POST')return reply({error:'POST bekleniyor.'},request,405);
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply({error:'Lütfen giriş yap.'},request,401);
 try{
  await ready;
  // İki istemci: kullanıcının kendi jetonu kimliği kanıtlar, servis anahtarı parayı taşır.
  const supabase=createClient(URL_,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const admin=createClient(URL_,SERVICE,{auth:{persistSession:false}});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return reply({error:'Oturum süresi doldu. Tekrar giriş yap.'},request,401);
  if(overLimit(user.id))return reply({error:'Çok hızlı gidiyorsun. Bir dakika sonra tekrar dene.'},request,429);

  const body=await request.json().catch(()=>({}));
  const action=String(body.action||''),id=String(body.id||'');
  if(!ACTIONS.has(action))return reply({error:'Geçersiz işlem.'},request,400);
  if(!validParcel(id))return reply({error:'Bu dijital parsel haritada yok.'},request,400);

  const {data:row}=await supabase.from('parcels').select('owner_id,listing,level,building').eq('id',id).maybeSingle();
  const p=parcel(id,epochWeek(),{});
  const price=Number(body.price);
  let cost=0;
  if(action==='buy')cost=row?Number(row.listing??0):p.value;
  else if(action==='build'){
   const building=buildings[String(body.type)];
   if(!building)return reply({error:'Geçersiz yapı.'},request,400);
   if(!canBuild(p,String(body.type)))return reply({error:'Oyun imar planı bu yapıya izin vermiyor.'},request,400);
   cost=building.cost;}
  else if(action==='upgrade')cost=upgradePrice({level:row?.level||1});

  const {data:result,error}=await admin.rpc('commit_action',{
   p_user:user.id,p_action:action,p_parcel:id,p_cost:cost,p_lon:p.lon,p_lat:p.lat,p_area:p.area,
   p_building:action==='build'?String(body.type):null,
   p_max_level:zones[p.zone].floors,
   p_price:action==='list'?(Number.isSafeInteger(price)?price:null):null});
  if(error)return reply({error:error.message.replace(/^.*?:\s*/,'')},request,400);

  const {data:profile}=await supabase.from('profiles').select('balance').eq('id',user.id).maybeSingle();
  return reply({ok:true,cost,balance:profile?.balance??null,parcel:result},request);
 }catch(error){
  console.error('action',error);
  return reply({error:error instanceof Error?error.message:'İşlem tamamlanamadı.'},request,400);}
});
