// The webhook is the only place jetons come into existence, so this drives it directly:
// (it imports the live rules over HTTPS, like the deployed function does.)
// only a correctly signed Stripe event, paid in lira for the exact price of a real pack,
// may reach the crediting call. Run with:  deno run --allow-all supabase/tests/webhook.test.ts
import Stripe from 'npm:stripe@18.5.0';

const SECRET='whsec_local_test_secret';
Deno.env.set('STRIPE_SECRET_KEY','sk_test_dummy');
Deno.env.set('STRIPE_WEBHOOK_SECRET',SECRET);
Deno.env.set('SUPABASE_URL','http://127.0.0.1:9/unreachable');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','service-role-dummy');

const stripe=new Stripe('sk_test_dummy',{httpClient:Stripe.createFetchHttpClient()});
const realServe=Deno.serve;
let handler!:(request:Request)=>Promise<Response>;
// @ts-ignore: capture the handler rather than opening a port
Deno.serve=(fn:any)=>{handler=fn;return {finished:Promise.resolve(),shutdown:async()=>{},ref(){},unref(){},addr:{}} as any;};
await import('../functions/stripe-webhook/index.ts');
Deno.serve=realServe;

const event=(amount:number,pack:string,status='paid')=>JSON.stringify({id:'evt_1',type:'checkout.session.completed',
 data:{object:{id:'cs_test_'+amount+pack+status,payment_status:status,currency:'try',amount_total:amount,
  metadata:{user_id:'11111111-1111-1111-1111-111111111111',pack}}}});
const post=async(body:string,signature?:string)=>{
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(signature!=='')headers['stripe-signature']=signature??await stripe.webhooks.generateTestHeaderStringAsync({payload:body,secret:SECRET});
 return handler(new Request('https://example.test/stripe-webhook',{method:'POST',body,headers}));};

let failed=0;
async function check(name:string,response:Response,status:number,body?:string){
 const text=await response.text();
 const ok=response.status===status&&(body===undefined||text.includes(body));
 if(!ok){failed++;console.error(`  HATA ${name}: ${response.status} ${text}`);}
 console.log(`${ok?'ok  ':'HATA'} ${name}`);}

await check('imzasız istek reddedilir',await post(event(40000,'avantajli'),''),400,'missing signature');
await check('sahte imza reddedilir',await post(event(40000,'avantajli'),'t=1,v1=deadbeef'),400,'invalid signature');
await check('tutarı düşürülmüş oturum jeton yüklemez',await post(event(100,'avantajli')),200,'ignored');
await check('ödenmemiş oturum jeton yüklemez',await post(event(40000,'avantajli','unpaid')),200,'ignored');
await check('olmayan paket jeton yüklemez',await post(event(40000,'bedava')),200,'ignored');
// Genuine: reaches the database call, which cannot be answered here, so Stripe is asked to retry.
await check('geçerli ödeme veritabanına iletilir',await post(event(40000,'avantajli')),500);

console.log(failed?`${failed} kontrol başarısız`:'webhook kontrolleri geçti');
Deno.exit(failed?1:0);
