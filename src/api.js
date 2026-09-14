// Everything that leaves the browser. Reads go straight to Supabase under row level security;
// anything that moves jetons or ownership goes through the edge functions, which recompute the
// price themselves. The browser is never trusted with a number that costs money.
import {createClient} from '@supabase/supabase-js';
import {accountBinding} from './browser-account.js';
const binding=accountBinding({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)});
const accountNotice='Bu tarayıcı ilk giriş yaptığın hesaba bağlı. Lütfen ilk Google hesabınla devam et. Paylaşılan cihaz veya hesap kurtarma için destek iste.';
async function verifyBrowserAccount(){
 const {data,error}=await need().auth.getUser();
 if(error)throw Error(turkish(error.message));
 if(!binding.accept(data.user)){
  await need().auth.signOut({scope:'local'});
  throw Error(accountNotice);
 }
 return data.user;
}

const url=import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/,''),anon=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const online=!!(url&&anon);
// OAuth dönüşünde Supabase'in URL'deki oturum bilgisini işlemesi gerekir.
export const supabase=online?createClient(url,anon,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;

const need=()=>{if(!supabase)throw Error('Sunucu bağlantısı yapılandırılmamış.');return supabase;};
// Supabase speaks English; the player should not.
const turkish=message=>{const m=String(message||'');
 if(/Token has expired|otp_expired/i.test(m))return 'Kodun süresi doldu. Yeni kod iste.';
 if(/invalid.*(?:token|otp)|Token.*invalid/i.test(m))return 'Doğrulama kodu hatalı.';
 if(/provider.*not enabled|unsupported provider/i.test(m))return 'Google girişi henüz etkinleştirilmemiş. Supabase Auth sağlayıcı ayarını kontrol et.';
 if(/rate limit|too many/i.test(m))return 'Çok fazla deneme. Biraz sonra tekrar dene.';
 if(/Failed to fetch|NetworkError/i.test(m))return 'Sunucuya ulaşılamadı. Bağlantını kontrol et.';
 return m||'İşlem tamamlanamadı.';};
const unwrap=({data,error})=>{if(error)throw Error(turkish(error.message));return data;};

export async function currentUser(){if(!supabase)return null;
 const {data}=await supabase.auth.getSession();if(!data.session)return null;
 try{return await verifyBrowserAccount();}catch(e){window.dispatchEvent(new CustomEvent('account-guard-error',{detail:e.message}));return null;}}
export function onAuthChange(handler){supabase?.auth.onAuthStateChange((_event,session)=>setTimeout(async()=>handler(session?await currentUser():null),0));}

export async function signInWithGoogle(){
 // Supabase yalnızca canlı GitHub Pages adresine döner; localhost token'ı URL'de bırakmaz.
 const redirectTo='https://haydarsahin0.github.io/mahalle/';
 const hint=binding.read()?.hint;
 const {data,error}=await need().auth.signInWithOAuth({provider:'google',options:{redirectTo,queryParams:hint?{login_hint:hint}:{}}});
 if(error)throw Error(turkish(error.message));
 return data;
}
export async function logout(){await supabase?.auth.signOut();}

export async function profile(id){
 return unwrap(await need().from('profiles').select('id,name,balance,welcome_gift_claimed,welcome_gift_parcel_id,stripe_onboarding_complete,first_home_claimed').eq('id',id).maybeSingle());}

const rows=data=>Object.fromEntries((data||[]).map(r=>[r.id,
 {owner:r.owner_id,building:r.building||null,level:r.level||0,listing:r.listing||null,crop:r.crop||null,cropReadyAt:r.crop_ready_at||null,rentLastCollected:r.rent_last_collected||null,rentPrice:r.rent_price||null,decorations:Array.isArray(r.decorations)?r.decorations:[],lastCareAt:r.last_care_at||null,careStreak:Number(r.care_streak||0),homeModel:r.home_model||0,homeFloors:r.home_floors||1,buildBlockedUntil:r.build_blocked_until||null,homeUnpermitted:!!r.home_unpermitted}]));

// Only bought parcels exist as rows, so a viewport read stays small even on a busy map.
export async function holdingsIn([west,south,east,north]){
 return rows(unwrap(await need().from('parcels').select('id,owner_id,building,level,listing,crop,crop_ready_at,rent_last_collected,rent_price,decorations,last_care_at,care_streak,home_model,home_floors,build_blocked_until,home_unpermitted')
  .gte('lon',west).lte('lon',east).gte('lat',south).lte('lat',north).limit(2000)));}
export async function myHoldings(userId){
 return rows(unwrap(await need().from('parcels').select('id,owner_id,building,level,listing,crop,crop_ready_at,rent_last_collected,rent_price,decorations,last_care_at,care_streak,home_model,home_floors,build_blocked_until,home_unpermitted')
  .eq('owner_id',userId).order('updated_at',{ascending:false}).limit(500)));}
export async function listedHoldings(){
 return rows(unwrap(await need().from('parcels').select('id,owner_id,building,level,listing,crop,crop_ready_at,rent_last_collected,rent_price,decorations,last_care_at,care_streak,home_model,home_floors,build_blocked_until,home_unpermitted')
  .not('listing','is',null).order('listing').limit(200)));}
export async function recentParcels(limit=18){
 const {data,error}=await need().from('parcels').select('id,owner_id,area,building,level,listing,crop,crop_ready_at,rent_last_collected,rent_price,decorations,last_care_at,care_streak,home_model,home_floors,build_blocked_until,home_unpermitted,created_at')
  .order('created_at',{ascending:false}).limit(limit);
 if(error)throw Error(turkish(error.message));
 return data||[];
}

async function callFunction(name,body){
 await verifyBrowserAccount();
 const {data:{session}}=await need().auth.getSession();
 if(!session)throw Error('Lütfen giriş yap.');
 const response=await fetch(`${url}/functions/v1/${name}`,{method:'POST',
  headers:{'Content-Type':'application/json',apikey:anon,Authorization:`Bearer ${session.access_token}`},
  body:JSON.stringify(body)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(turkish(payload.error)||'İşlem tamamlanamadı.');
 return payload;}

export const act=(action,id,data={})=>callFunction('action',{action,id,...data});
export const startCheckout=pack=>callFunction('checkout',{pack});
export const startCustomCheckout=jetons=>callFunction('checkout',{customAmount:jetons});
export const startParcelCheckout=parcel=>callFunction('checkout',{parcel});
export const confirmCheckout=session_id=>callFunction('confirm-checkout',{session_id});
// Ödemesi alınıp jetonu yüklenmemiş oturum kalmışsa sunucu bulur ve yükler. Sessiz çalışır:
// kurtaracak bir şey yoksa sıfır döner.
export const recoverPayments=()=>callFunction('recover-payments',{});
export const startConnectOnboarding=(mode='onboard')=>callFunction('connect-onboarding',{mode});
export const claimWelcomeGift=()=>callFunction('welcome-gift',{});
