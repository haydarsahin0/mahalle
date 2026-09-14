import {supabase} from './api.js';
import {SEEDS,fresh,normalize,level,ready,complete,move} from './garden-state.js';
export async function mountGarden(root,userId,parcelId){
 let state=fresh(),revision=null,tool='weed',seed=0,busy=false,stopped=false,timer,message='Önce tırmığı seçip topraktaki otları temizle.';
 const dialog=root.closest('dialog');
 const stop=()=>{stopped=true;clearInterval(timer);};
 dialog?.addEventListener('close',stop,{once:true});
 async function load(){
  const {data,error}=await supabase.from('hobby_gardens').select('state,revision').eq('user_id',userId).eq('parcel_id',parcelId).maybeSingle();
  if(error)throw error;state=normalize(data?.state,Date.now());revision=data?.revision??null;
 }
 function render(){
  if(stopped||!root.isConnected)return;
  const active=root.contains(document.activeElement)?document.activeElement?.dataset?.key:null;
  state=normalize(state,Date.now());const lv=level(state);
  root.innerHTML=`<div class="garden-heading"><span>ÜCRETSİZ HOBİ BAHÇESİ</span><h2>Küçük bahçen, büyük keyfin.</h2><p>Tohumlar ve araçlar ücretsiz. Bahçe puanları yeni tohumlar açar; jetona veya paraya dönüşmez.</p></div>
  <div class="garden-progress"><b>🌿 Seviye ${lv}</b><span>${state.xp%40}/40 bahçe puanı</span><progress max="40" value="${state.xp%40}" aria-label="Seviye ilerlemesi"></progress></div>
  <div class="garden-tools" aria-label="Bahçe araçları">${[['weed','🧹','Ot temizle'],['plant','🌱','Tohum ek'],['water','💧','Sula'],['harvest','🧺','Hasat et']].map(([id,emoji,label])=>`<button data-tool="${id}" data-key="${id}" aria-pressed="${tool===id}" ${busy?'disabled':''}>${emoji}<span>${label}</span></button>`).join('')}</div>
  <div class="garden-seeds" aria-label="Tohum seç">${SEEDS.map((s,i)=>`<button data-seed="${i}" data-key="seed${i}" aria-pressed="${seed===i}" ${lv<s.level||busy?'disabled':''}>${s.icon} ${s.name}<small>${lv<s.level?'Seviye '+s.level:Math.ceil(s.seconds/60)+' dk · ücretsiz'}</small></button>`).join('')}</div>
  <div class="garden-board" aria-label="Dokuz ekim alanı">${state.tiles.map((t,i)=>{const grown=ready(t,Date.now()),weedy=!state.weeded.includes(i),left=t?Math.max(0,Math.ceil((t.ready-Date.now())/1000)):0;const label=weedy?'Otları temizle':!t?'Ekim için hazır':!t.watered?'Su bekliyor':grown?'Hasada hazır':Math.floor(left/60)+':'+String(left%60).padStart(2,'0');return `<button class="garden-tile ${grown?'ripe':''} ${t?.watered?'watered':''}" data-tile="${i}" data-key="tile${i}" aria-label="Alan ${i+1}: ${label}" ${busy?'disabled':''}><span>${t?(grown?SEEDS[t.seed].icon:'🌱'):weedy?'🌿':'➕'}</span><small>${label}</small></button>`;}).join('')}</div>
  <p class="garden-message" role="status"></p>
  <section class="garden-daily"><h3>☀️ Bugünün küçük işleri</h3><p>Her gün yenilenir · UTC takvimi</p>${[['weed','3 alan temizle'],['plant','3 tohum ek'],['water','3 filiz sula'],['harvest','3 ürün hasat et']].map(([id,label])=>`<div><span>${state.tasks[id]>=3?'✅':'○'} ${label}</span><b>${Math.min(3,state.tasks[id])}/3</b></div>`).join('')}<button data-claim data-key="claim" ${!complete(state)||state.claimed||busy?'disabled':''}>${state.claimed?'✓ Günlük ödül alındı':'Günlük ödülü al · +20 bahçe puanı'}</button></section>
  <section class="garden-collection"><h3>🧺 Hasat koleksiyonun</h3><div>${SEEDS.map((s,i)=>`<span title="${s.name}">${s.icon}<b>${state.collection[i]}</b></span>`).join('')}</div><p>Ürünlerin solmaz. İstediğin zaman geri gel, kaldığın yerden devam et.</p></section>`;
  root.querySelector('.garden-message').textContent=busy?'Bahçen kaydediliyor…':message;
  if(active)root.querySelector(`[data-key="${active}"]`)?.focus({preventScroll:true});
 }
 const click=async e=>{
  const b=e.target.closest('button');if(!b||busy||stopped)return;
  if(b.dataset.tool){tool=b.dataset.tool;render();return;}
  if(b.dataset.seed!==undefined){seed=Number(b.dataset.seed);tool='plant';render();return;}
  if(b.dataset.tile===undefined&&!b.hasAttribute('data-claim'))return;
  try{
   const next=move(state,b.hasAttribute('data-claim')?'claim':tool,Number(b.dataset.tile),seed);
   busy=true;render();
   let query;
   if(revision===null)query=supabase.from('hobby_gardens').insert({user_id:userId,parcel_id:parcelId,state:next,revision:0});
   else query=supabase.from('hobby_gardens').update({state:next,revision:revision+1}).eq('user_id',userId).eq('parcel_id',parcelId).eq('revision',revision);
   const {data,error}=await query.select('revision').single();
   if(error){await load();throw Error('Kaydedilemedi veya başka sekmede değişti. Bahçen yenilendi; tekrar dene.');}
   state=next;revision=data.revision;
   message=b.hasAttribute('data-claim')?'🎉 Günlük görevler tamam! +20 bahçe puanı.':({weed:'Toprak temiz! Şimdi ücretsiz bir tohum seç.',plant:'Tohum ekildi! Su damlasını seçip filizi sula.',water:'Mis gibi! Filizin büyüyor. Diğer alanlarla ilgilenebilirsin.',harvest:'🎉 Hasat koleksiyonuna eklendi! +6 bahçe puanı.'})[tool];
  }catch(err){message=err.message||'Bağlantını kontrol edip tekrar dene.';}
  finally{busy=false;render();}
 };
 root.addEventListener('click',click);
 try{await load();if(stopped)return;render();timer=setInterval(()=>{if(!busy&&!document.hidden)render();},1000);}
 catch{root.innerHTML='<p>Bahçe yüklenemedi. İnternet bağlantını kontrol edip yeniden aç.</p>';}
 return stop;
}
