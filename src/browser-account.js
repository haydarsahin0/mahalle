// Convenience/abuse friction only; not a server-side proof of a unique device.
const KEY='dijitalarsam.browser-account.v1';
export function accountBinding(storage){
 return {
  read(){try{const v=JSON.parse(storage.getItem(KEY));return v?.id?v:null;}catch{return null;}},
  accept(user){
   if(!user?.id)return false;
   const saved=this.read();
   if(saved&&saved.id!==user.id)return false;
   const google=user.identities?.find(i=>i.provider==='google');
   try{storage.setItem(KEY,JSON.stringify({id:user.id,hint:google?.identity_data?.sub||saved?.hint||''}));}
   catch{throw Error('Giriş için tarayıcıda site verilerinin kaydedilmesine izin ver.');}
   return true;
  }
 };
}
