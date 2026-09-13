import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import Stripe from 'stripe';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setBoundary,setLanduse,makeState,applyAction,epochWeek} from '../src/land.js';
setBoundary(JSON.parse(await readFile(new URL('../public/data/turkey.json',import.meta.url),'utf8')));
// Zoning must be identical on both sides, so the server reads the same land-use data as the client.
if(!setLanduse(JSON.parse(await readFile(new URL('../public/data/landuse.json',import.meta.url),'utf8'))))throw Error('landuse.json eksik veya bozuk.');
const {DATABASE_URL,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET,CLIENT_ORIGIN,CLIENT_URL,PORT=3001}=process.env;
if(!DATABASE_URL||!CLIENT_ORIGIN||!CLIENT_URL)throw Error('Set DATABASE_URL, CLIENT_ORIGIN and CLIENT_URL in .env.');
const pool=new pg.Pool({connectionString:DATABASE_URL});
await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
await pool.query('INSERT INTO digital_world(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING',[JSON.stringify(makeState())]);
// Parcel identifiers changed with the irregular layout, so a pre-v3 world cannot be carried over.
await pool.query("UPDATE digital_world SET data=$1 WHERE id=1 AND COALESCE((data->>'version')::int,0)<3",[JSON.stringify(makeState())]);
const app=express(),stripe=STRIPE_SECRET_KEY?new Stripe(STRIPE_SECRET_KEY):null;
app.disable('x-powered-by');app.use(cors({origin:CLIENT_ORIGIN}));
app.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
const hash=s=>createHash('sha256').update(s).digest('hex');
function fail(msg,status=400){const e=new Error(msg);e.status=status;throw e;}
async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
// Webhook must receive raw bytes. Checkout redirects NEVER award credit.
app.post('/stripe/webhook',express.raw({type:'application/json',limit:'100kb'}),async(req,res,next)=>{
 if(!stripe||!STRIPE_WEBHOOK_SECRET)return res.sendStatus(503);
 let event;try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],STRIPE_WEBHOOK_SECRET);}catch{return res.status(400).json({error:'Invalid signature'});}
 try{if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
  const s=event.data.object;if(s.payment_status==='paid'){
   if(s.amount_total!==500||s.currency!=='eur'||s.metadata?.product!=='dijital-arsam-1000'||!/^[0-9a-f-]{36}$/.test(s.metadata?.user_id||''))fail('Unexpected checkout payload');
   await transaction(async c=>{const inserted=await c.query('INSERT INTO payments(session_id,user_id,amount) VALUES($1,$2,1000) ON CONFLICT DO NOTHING RETURNING session_id',[s.id,s.metadata.user_id]);if(inserted.rowCount)await c.query('UPDATE users SET balance=balance+1000 WHERE id=$1',[s.metadata.user_id]);});
  }
 }res.json({received:true});}catch(e){next(e);}
});
app.use(express.json({limit:'12kb'}));
// Coarse IP rate limits supplement hashed sessions and database locks.
const attempts=new Map();setInterval(()=>{const now=Date.now();for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);},60000).unref();
function rate(limit){return(req,res,next)=>{const key=req.ip+req.path;const now=Date.now();let v=attempts.get(key);if(!v||v.until<now)v={n:0,until:now+60000};v.n++;attempts.set(key,v);if(v.n>limit)return res.status(429).json({error:'Çok fazla deneme. Bir dakika sonra tekrar dene.'});next();};}
async function auth(req,res,next){try{const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)fail('Lütfen giriş yap.',401);const r=await pool.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires>now()',[hash(token)]);if(!r.rowCount)fail('Oturum süresi doldu. Tekrar giriş yap.',401);req.userId=r.rows[0].user_id;next();}catch(e){next(e);}}
app.get('/health',async(req,res,next)=>{try{await pool.query('SELECT 1');res.json({ok:true,payments:!!stripe});}catch(e){next(e);}});
app.get('/world',rate(120),async(req,res,next)=>{try{const r=await pool.query('SELECT data FROM digital_world WHERE id=1');const {balance,...world}=r.rows[0].data;res.json({...world,week:epochWeek()});}catch(e){next(e);}});
app.post('/auth/:mode',rate(8),async(req,res,next)=>{try{
 const {mode}=req.params;const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||''),name=String(req.body.name||'').trim();
 if(!['register','login'].includes(mode))fail('Geçersiz işlem.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<10||password.length>128)fail('Geçerli e-posta ve en az 10 karakterli şifre gir.');
 let user;
 if(mode==='register'){if(name.length<2||name.length>40)fail('İsim 2–40 karakter olmalı.');const salt=randomBytes(16).toString('hex'),digest=scryptSync(password,salt,64).toString('hex');const r=await pool.query('INSERT INTO users(id,email,name,password) VALUES($1,$2,$3,$4) RETURNING id,name',[randomUUID(),email,name,salt+':'+digest]);user=r.rows[0];}
 else{const r=await pool.query('SELECT * FROM users WHERE email=$1',[email]);user=r.rows[0];const [salt,digest]=(user?.password||'dummy:'+ '0'.repeat(128)).split(':');const valid=timingSafeEqual(scryptSync(password,salt,64),Buffer.from(digest,'hex'));if(!user||!valid)fail('E-posta veya şifre hatalı.',401);}
 const token=randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,expires) VALUES($1,$2,now()+interval '7 days')",[hash(token),user.id]);res.json({id:user.id,name:user.name,token});
 }catch(e){if(e.code==='23505')e=Object.assign(new Error('Bu e-posta ile kayıt yapılamadı. Giriş yapmayı dene.'),{status:409});next(e);}});
app.get('/me',auth,async(req,res,next)=>{try{const r=await pool.query('SELECT id,name,balance FROM users WHERE id=$1',[req.userId]);res.json({...r.rows[0],balance:Number(r.rows[0].balance)});}catch(e){next(e);}});
app.post('/logout',auth,async(req,res,next)=>{try{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(req.headers.authorization.replace(/^Bearer /,''))]);res.json({ok:true});}catch(e){next(e);}});
app.post('/checkout',rate(6),auth,async(req,res,next)=>{try{if(!stripe||!STRIPE_WEBHOOK_SECRET)fail('Ödemeler henüz açılmadı.',503);const s=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],line_items:[{price_data:{currency:'eur',unit_amount:500,product_data:{name:'Dijital Arsam · 1.000 oyun jetonu',description:'Sanal oyun jetonu. Nakde çevrilemez.'}},quantity:1}],metadata:{user_id:req.userId,product:'dijital-arsam-1000'},success_url:CLIENT_URL+'?payment=success',cancel_url:CLIENT_URL+'?payment=cancel'});res.json({url:s.url});}catch(e){next(e);}});
app.post('/action',rate(30),auth,async(req,res,next)=>{try{const result=await transaction(async c=>{
 const {action,id,type,price}=req.body;
 // Serialize world changes, buyer debit and seller credit in one database transaction.
 const r=await c.query('SELECT data FROM digital_world WHERE id=1 FOR UPDATE');
 const u=(await c.query('SELECT id,balance FROM users WHERE id=$1 FOR UPDATE',[req.userId])).rows[0];
 const state={...r.rows[0].data,week:epochWeek(),balance:Number(u.balance)};
 let result;try{result=applyAction(state,u.id,action,id,{type,price});}catch(e){fail(e.message,400);}
 await c.query('UPDATE users SET balance=$1 WHERE id=$2',[state.balance,u.id]);
 if(result.seller)await c.query('UPDATE users SET balance=balance+$1 WHERE id=$2',[result.cost,result.seller]);
 const {balance,...world}=state;
 await c.query('UPDATE digital_world SET data=$1 WHERE id=1',[JSON.stringify(world)]);
 await c.query('INSERT INTO digital_activity(user_id,action,plot_id,amount) VALUES($1,$2,$3,$4)',[u.id,action,id,result.cost]);
 return {ok:true,revision:world.revision};
 });res.json(result);}catch(e){next(e);}});
app.use((err,req,res,next)=>{console.error(err.message);res.status(err.status||500).json({error:err.status?err.message:'Sunucu işlemi tamamlayamadı. Lütfen tekrar dene.'});});
app.listen(PORT,()=>console.log('Dijital Arsam API listening on '+PORT));
