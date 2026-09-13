// Everything that leaves the browser. Reads go straight to Supabase under row level security;
// anything that moves jetons or ownership goes through the edge functions, which recompute the
// price themselves. The browser is never trusted with a number that costs money.
import {createClient} from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/,''),anon=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const online=!!(url&&anon);
export const supabase=online?createClient(url,anon,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):null;

const need=()=>{if(!supabase)throw Error('Sunucu bağlantısı yapılandırılmamış.');return supabase;};
// Supabase speaks English; the player should not.
const turkish=message=>{const m=String(message||'');
 if(/Invalid login credentials/i.test(m))return 'E-posta veya şifre hatalı.';
 if(/Email not confirmed/i.test(m))return 'Önce e-postandaki doğrulama bağlantısına tıkla.';
 if(/User already registered/i.test(m))return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
 if(/Password should be at least/i.test(m))return 'Şifre en az 8 karakter olmalı.';
 if(/rate limit|too many/i.test(m))return 'Çok fazla deneme. Biraz sonra tekrar dene.';
 if(/Failed to fetch|NetworkError/i.test(m))return 'Sunucuya ulaşılamadı. Bağlantını kontrol et.';
 return m||'İşlem tamamlanamadı.';};
const unwrap=({data,error})=>{if(error)throw Error(turkish(error.message));return data;};

export async function currentUser(){if(!supabase)return null;
 const {data}=await supabase.auth.getSession();return data.session?.user||null;}
export function onAuthChange(handler){supabase?.auth.onAuthStateChange((_event,session)=>handler(session?.user||null));}

export async function register(email,password,name){
 const {data,error}=await need().auth.signUp({email,password,options:{data:{name}}});
 if(error)throw Error(turkish(error.message));
 // With email confirmation on, Supabase returns a user without a session.
 return {user:data.user,needsConfirmation:!data.session};}
export async function login(email,password){
 const {data,error}=await need().auth.signInWithPassword({email,password});
 if(error)throw Error(turkish(error.message));return data.user;}
export async function logout(){await supabase?.auth.signOut();}

export async function profile(id){
 return unwrap(await need().from('profiles').select('id,name,balance').eq('id',id).maybeSingle());}

const rows=data=>Object.fromEntries((data||[]).map(r=>[r.id,
 {owner:r.owner_id,building:r.building||null,level:r.level||0,listing:r.listing||null}]));

// Only bought parcels exist as rows, so a viewport read stays small even on a busy map.
export async function holdingsIn([west,south,east,north]){
 return rows(unwrap(await need().from('parcels').select('id,owner_id,building,level,listing')
  .gte('lon',west).lte('lon',east).gte('lat',south).lte('lat',north).limit(2000)));}
export async function myHoldings(userId){
 return rows(unwrap(await need().from('parcels').select('id,owner_id,building,level,listing')
  .eq('owner_id',userId).order('updated_at',{ascending:false}).limit(500)));}
export async function listedHoldings(){
 return rows(unwrap(await need().from('parcels').select('id,owner_id,building,level,listing')
  .not('listing','is',null).order('listing').limit(200)));}

async function callFunction(name,body){
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
