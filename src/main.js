import './style.css';
import {createTicker} from './ticker.js';
import {createMap} from './map.js';
import {setLand,landFeature,setLanduse,parcel,epochWeek,ZONES,BUILDINGS,HOTSPOTS,rumor,canBuild,upgradePrice} from './land.js';
import {PACKS,lira,bonus} from './packs.js';
import {online,currentUser,onAuthChange,signInWithGoogle,logout,profile,holdingsIn,myHoldings,listedHoldings,recentParcels,act,startCheckout,startCustomCheckout,startParcelCheckout,startConnectOnboarding,claimWelcomeGift} from './api.js';
const $=s=>document.querySelector(s),fmt=n=>new Intl.NumberFormat('tr-TR').format(n),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Turkish writes the lira sign after the amount.
const money=n=>fmt(Math.round(n*100)/100)+' ₺';
const paths={pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',grid:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',home:'<path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7"/>',shop:'<path d="M4 10v10h16V10M3 10l2-7h14l2 7M9 20v-7h6v7M3 10q3 4 6 0 3 4 6 0 3 4 6 0"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',layers:'<path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 7V4l14-2v3m4 7h-6v4h6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 8c0-4 7-3 6 1-.5 2-3 2-3 5m0 2v1"/>'};
function icon(n){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]||paths.pin}</svg>`;}
let state={version:4,holdings:{},balance:0,week:epochWeek(),revision:1,userId:null};
let user=null,account_={name:'',welcomeGiftClaimed:true,welcomeGiftParcelId:null,stripeOnboardingComplete:false},map,selected=null,tab='explore',filter='all',visible=[],places=[],recent=[],busy=false,available=false,lastBox='',giftPromptedFor=null;
$('#app').innerHTML=`<header><a href="./" class="brand"><span class="brand-mark">${icon('layers')}</span><span>dijital<span class="brand-light">arsam</span><i></i></span></a><nav aria-label="Ana menü"><button data-tab="explore" class="active">${icon('map')} Keşfet</button><button data-tab="market">${icon('shop')} Pazar yeri</button><button data-tab="mine">${icon('grid')} Arsalarım</button></nav><div class="account"><span class="demo-badge">${online?'ORTAK DÜNYA':'ÇEVRİMDIŞI'}</span><button class="wallet" id="wallet">${icon('wallet')} <b id="balance"></b><span>+</span></button><button class="avatar" id="account" aria-label="Hesap">D</button></div></header>
<main><section class="map-panel"><div id="map"></div><div class="map-shade"></div><div class="recent-ticker" aria-label="Son dağıtılan arsalar"><span class="ticker-label">SON DAĞITILANLAR</span><div class="ticker-window"><div class="ticker-track" id="recent-ticker-track"></div></div></div><div class="map-intro"><div class="overline"><i></i> GERÇEK HARİTA. SENİN DİJİTAL DÜNYAN.</div><h1>Türkiye’de bir yer.<br><em>Hayalinde bir gelecek.</em></h1><p>Keşfet, dijital arsanı seç, kendi hikâyeni inşa et.</p></div><div class="search-area"><form id="search-form"><span>${icon('search')}</span><input id="search" placeholder="İl, ilçe veya koordinat ara…" aria-label="İl, ilçe veya enlem boylam ara" autocomplete="off"><button aria-label="Ara">↵</button></form><div id="results" hidden></div><div class="quick-places">${HOTSPOTS.slice(0,5).map((p,i)=>`<button data-hot="${i}">${p.name}</button>`).join('')}</div></div>
<div class="layer-switch" role="group" aria-label="Harita türü"><button class="active" data-mode="satellite">◉ Uydu</button><button data-mode="street">${icon('map')} Sokak</button></div><div class="map-actions"><button id="turkey" title="Türkiye'nin tamamı" aria-label="Türkiye'nin tamamını göster">${icon('map')}</button><button id="grid" aria-label="Parselleri göster veya gizle" aria-pressed="true">${icon('grid')}</button><button id="tilt" aria-label="Üç boyutlu görünüm">3D</button></div><div class="map-status"><span class="pulse"></span><span id="map-status">Türkiye haritası yükleniyor…</span></div><div class="map-legend"><span><i style="background:#b9c583"></i>Tarla · imarsız</span><span><i style="background:#a8c5e0"></i>Konut arsası</span><span><i style="background:#d9b087"></i>Ticaret</span><span><i style="background:#fbe1a2"></i>Seçili</span></div><div class="map-notice">Parsel şekilleri üretilmiştir; imar sınıfı gerçek yerleşim verisinden türetilir. Tapu kaydı değildir.</div><div id="map-error" hidden></div></section>
<aside><div id="side"></div><footer><span>Bir yer seç. Bir gelecek hayal et.</span><button id="help" aria-label="Oyun hakkında">${icon('help')}</button></footer></aside></main><div id="toast" role="status" aria-live="polite"></div><dialog id="modal"></dialog>`;
function mine(p){return !!user&&p.owner===user.id;}
function get(id){return parcel(id,state.week,state.holdings);}
function safeGet(id){try{return get(id);}catch{return null;}}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function modal(html){$('#modal').innerHTML=`<button class="close" aria-label="Kapat">${icon('close')}</button>${html}`;$('#modal .close').onclick=()=>$('#modal').close();if(!$('#modal').open)$('#modal').showModal();}
function remember(rows){Object.assign(state.holdings,rows);}
const recentTicker=createTicker($('.recent-ticker'),id=>select(id,true));
function renderRecent(){
 const track=$('#recent-ticker-track');if(!track)return;
 if(!recent.length){recentTicker.update('');return;}
 const items=recent.map(row=>{const p=safeGet(row.id),name=(p?.district||'Türkiye').split(' / ')[0],kind=p?.zone==='field'?'Tarla':p?.zone==='mixed'?'Ticaret + konut':'Konut arsası';
  return `<button class="ticker-item" data-recent-parcel="${esc(row.id)}"><i aria-hidden="true">${p?.zone==='field'?'🌱':'✦'}</i><span><b>${esc(name)}</b><small>${fmt(row.area||p?.area||0)} m² · ${kind}</small></span><time class="ticker-time" data-time="${esc(row.created_at||'')}" title="İlk dağıtım zamanı"></time></button>`;}).join('');
 recentTicker.update(items);
}
async function loadRecentParcels(){
 if(!online)return;
 try{const rows=await recentParcels();recent=rows;remember(Object.fromEntries(rows.map(r=>[r.id,{owner:r.owner_id,building:r.building||null,level:r.level||0,listing:r.listing||null,crop:r.crop||null,cropReadyAt:r.crop_ready_at||null,rentLastCollected:r.rent_last_collected||null,rentPrice:r.rent_price||null}])));renderRecent();}
 catch(e){console.warn('recent parcels',e.message);}
}

// ---------------------------------------------------------------- data
async function loadViewport(bounds){
 if(!online)return;
 const key=bounds.map(n=>n.toFixed(3)).join(',');
 if(key===lastBox)return;
 lastBox=key;
 try{remember(await holdingsIn(bounds));map?.render(state);}catch(e){console.warn(e.message);}}
async function syncAccount(next){
 user=next||null;
 state.userId=user?.id||null;
 if(!user){account_={name:'',welcomeGiftClaimed:true,welcomeGiftParcelId:null,stripeOnboardingComplete:false};giftPromptedFor=null;state.balance=0;draw();return;}
 try{const me=await profile(user.id);account_={name:me?.name||'Komşu',welcomeGiftClaimed:!!me?.welcome_gift_claimed,welcomeGiftParcelId:me?.welcome_gift_parcel_id||null,stripeOnboardingComplete:!!me?.stripe_onboarding_complete};state.balance=Number(me?.balance||0);
  remember(await myHoldings(user.id));
  if(!account_.welcomeGiftClaimed&&giftPromptedFor!==user.id){giftPromptedFor=user.id;setTimeout(()=>{if(user?.id===giftPromptedFor&&!account_.welcomeGiftClaimed)openWelcomeWheel();},120);}
 }catch(e){toast(e.message);}
 map?.render(state);draw();}
async function loadMarket(){if(!online)return;try{remember(await listedHoldings());draw();}catch(e){toast(e.message);}}

function draw(){
 $('#balance').textContent=fmt(state.balance);
 $('#account').textContent=(account_.name||'?').trim().charAt(0).toLocaleUpperCase('tr')||'?';
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 if(selected){detail();return;}
 const owned=Object.keys(state.holdings).filter(id=>safeGet(id)&&mine(get(id))),listed=Object.keys(state.holdings).filter(id=>state.holdings[id].listing&&safeGet(id));
 $('#side').innerHTML=`<div class="eyebrow">${tab==='mine'?'DİJİTAL PORTFÖYÜN':tab==='market'?'KOMŞUDAN KOMŞUYA':'YENİ BİR BAŞLANGIÇ'}</div><h2>${tab==='mine'?'Geleceğe ayırdığın<br>küçük yerler.':tab==='market'?'Yeni sahibini<br>bekleyen hikâyeler.':'Bir toprak parçası.<br>Binlerce ihtimal.'}</h2><p class="muted">${tab==='mine'?'Arsalarını yönet, izinlerini incele ve yeni bir şeyler kur.':tab==='market'?'Oyuncuların satışa çıkardığı dijital parselleri keşfet.':'Ege’de bir tarla, şehirde bir arsa… Türkiye’yi yakınlaştır, sana ait bir hikâye başlat.'}</p>
 ${user&&!account_.welcomeGiftClaimed?`<div class="welcome-gift-card"><span>🎁</span><div><strong>İlk arsan bizden</strong><p>Çarkı bir kez çevir, Türkiye’den rastgele bir dijital parsel kazan.</p></div><button id="gift-open">Çevir</button></div>`:''}
 <div class="season-card"><span class="season-icon">🌱</span><div><strong>${state.week+1}. hafta <span>OYUN TAKVİMİ</span></strong><p>Hafta herkes için aynı anda ilerler.</p></div></div>
 ${tab==='mine'?`<div class="portfolio-stats"><div><strong>${owned.length}</strong><small>Dijital parsel</small></div><div><strong>${fmt(owned.reduce((n,id)=>n+get(id).value,0))} ◈</strong><small>Tahmini oyun değeri</small></div></div>`:''}
 <div class="list-head"><h3>${tab==='mine'?'Arsalarım':tab==='market'?'Satıştaki parseller':'Görünür parseller'}</h3><span>${tab==='mine'?owned.length:tab==='market'?listed.length:visible.length}</span></div><div class="filters">${['all','field','home','mixed'].map((f,i)=>`<button data-filter="${f}" class="${filter===f?'active':''}">${['Tümü','Tarla','Konut','Ticaret'][i]}</button>`).join('')}</div><div id="parcel-list"></div><div class="source-note">${online?'Ortak dünya · 1 jeton = 1 ₺. Jetonlar oyun içindir, nakde çevrilemez.':'Sunucu bağlantısı yapılandırılmadı: haritayı gezebilirsin, alım yapılamaz.'}</div>`;
 let ids=tab==='mine'?owned:tab==='market'?listed:visible;
 ids=ids.filter(id=>{const p=safeGet(id);return p&&(filter==='all'||filter==='home'&&p.zone.startsWith('home')||p.zone===filter);});
 $('#parcel-list').innerHTML=ids.length?ids.slice(0,30).map(id=>{const p=get(id);return `<button class="parcel-card" data-parcel="${id}"><span class="parcel-art ${p.zone}" style="--parcel:${ZONES[p.zone].color}"><i></i><b>${p.building?BUILDINGS[p.building].icon:p.zone==='field'?'♧':'⌂'}</b></span><span class="card-info"><small>${mine(p)?'SENİN ARSAN':p.listing?'OYUNCU İLANI':ZONES[p.zone].name.toLocaleUpperCase('tr')}</small><strong>Dijital parsel <span>${id.split('-').slice(1).join('·')}</span></strong><span>${fmt(p.area)} m² · ${esc(p.district)}</span><b>${fmt(p.listing||p.value)} ◈ <em>${p.arsa?'İmarlı arsa':p.fringe?'Gelişme sınırı':'Tarla'}</em></b></span><span class="card-chevron">›</span></button>`;}).join(''):`<div class="empty"><span>${icon(tab==='mine'?'grid':'pin')}</span><strong>${tab==='mine'?'İlk arsan seni bekliyor.':tab==='market'?'Henüz satış ilanı yok.':'Biraz daha yakından bakalım.'}</strong><p>${tab==='explore'?'Bir şehir seç, mahalle ölçeğine yakınlaş ve renkli bir parsele dokun.':tab==='market'?'Sahip olduğun bir parseli satışa çıkarabilirsin.':'Haritayı keşfederek ilk dijital parselini seç.'}</p><button id="discover" class="text-button">${tab==='explore'?'İzmir’i keşfet':'Haritaya dön'} ${icon('arrow')}</button></div>`;
 if(ids.length>30)$('#parcel-list').insertAdjacentHTML('beforeend','<p class="source-note">İlk 30 parsel gösteriliyor. Diğerlerini doğrudan haritadan seçebilirsin.</p>');
 document.querySelectorAll('[data-parcel]').forEach(b=>b.onclick=()=>select(b.dataset.parcel,true));
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;draw();});
 $('#gift-open')?.addEventListener('click',openWelcomeWheel);
 $('#discover')?.addEventListener('click',()=>{tab='explore';filter='all';map?.go(HOTSPOTS[1].loc);draw();});
}
function select(id,fly=false){selected=id;map?.select(id,fly);draw();if(innerWidth<760)$('#side').scrollIntoView({behavior:'smooth',block:'start'});}
function detail(){const p=get(selected),zone=ZONES[p.zone],r=rumor(p,state.week),owned=mine(p),buyable=!p.owner||p.listing;
 const cropNames={wheat:'Buğday',olive:'Zeytin',lavender:'Lavanta',greenhouse:'Sera ürünü'},now=Date.now(),ready=p.cropReadyAt?new Date(p.cropReadyAt).getTime()<=now:false;
 const activity=owned&&p.building==='farm'?`<div class="farm-cycle"><h3>🌱 Günlük üretim</h3>${p.crop?`<p><strong>${cropNames[p.crop]||p.crop}</strong> ${ready?'hasada hazır!':'büyüyor.'}</p><small>${ready?'Şimdi hasat edip küçük bir jeton ödülü kazanabilirsin.':'Her ürün 24 saatte olgunlaşır. Yarın tekrar gel.'}</small><button class="primary" id="${ready?'harvest':'farm-wait'}" ${ready?'':'disabled'}>${ready?'Hasat et · + jeton':'Olgunlaşması bekleniyor'}</button>`:`<p>Tarlana bir ürün seç, yarın hasat edip jeton kazan.</p><div class="crop-grid">${[['wheat','🌾','Buğday'],['olive','🫒','Zeytin'],['lavender','💜','Lavanta'],['greenhouse','🥬','Sera']].map(([k,i,n])=>`<button data-crop="${k}"><span>${i}</span><b>${n}</b><small>Ekim</small></button>`).join('')}</div>`}</div>`:owned&&p.building&&p.building!=='farm'?`<div class="rent-card"><h3>🏠 Kira geliri</h3><p>Bu yapıdan her 24 saatte küçük bir kira geliri toplayabilirsin.</p><button class="primary" id="collect-rent">Kira geliri topla · +${p.building==='home'?2:4} jeton</button></div>`:'';
 $('#side').innerHTML=`<button class="back" id="back">← Keşfe dön</button><div class="detail-visual" style="--parcel:${zone.color}"><span class="detail-map-grid"></span><span class="parcel-art ${p.zone}"><i></i><b>${p.building?BUILDINGS[p.building].icon:p.zone==='field'?'🌾':'⌂'}</b></span><span class="zone-pill">${zone.name}</span></div><div class="eyebrow">DİJİTAL PARSEL · ${p.id}</div><h2>${p.building?BUILDINGS[p.building].name:p.zone==='field'?'Toprağında ihtimal var.':'Hayalin için bir yer.'}</h2><p class="coordinates">${icon('pin')} ${p.lat.toFixed(5)}° K, ${p.lon.toFixed(5)}° D <button id="show-map">Haritada gör ↗</button></p>
 <div class="facts"><div><small>Parsel alanı ≈</small><strong>${fmt(p.area)} m²</strong></div><div><small>Nitelik</small><strong>${p.arsa?'Arsa (imarlı)':p.fringe?'Tarla · gelişme sınırı':'Tarla / arazi'}</strong></div><div><small>Oyun plan türü</small><strong>${zone.plan}</strong></div><div><small>Kat izni</small><strong>${zone.floors?`En fazla ${zone.floors} kat`:'Yapı izni yok'}</strong></div><div><small>İş yeri izni</small><strong>${zone.commercial?'İzin var':'İzin yok'}</strong></div><div><small>Metrekare birim</small><strong>${(p.value/p.area).toFixed(2).replace('.',',')} ₺/m²</strong></div></div>
 <p class="source-note">${p.context.inUrban?'Yerleşik alan sınırı içinde':'Yerleşik alan sınırı dışında'} · ilçe merkezine ${(p.context.distance/1000).toFixed(1)} km · ilçe nüfusu ${fmt(p.context.pop)} (TÜİK ADNKS) · ${esc(p.district)}. İmar sınıfı bu gerçek verilerden türetilmiş oyun kurgusudur.</p>
 <div class="rumor ${p.base==='field'?'':'confirmed'}"><div><span>✧</span><small>${r.state}</small></div><strong>${r.title}</strong><p>${r.text}</p></div>
 ${activity}
 ${p.building?`<button id="model-preview" class="secondary">${icon('home')} Yapıyı 3D incele</button><div class="building-status">${BUILDINGS[p.building].icon} ${BUILDINGS[p.building].name} <b>${p.building==='farm'?'Tarım kullanımı':p.level+' / '+zone.floors+' kat'}</b></div>`:''}
 <div id="actions">${owned?(!p.building?`<h3>Arsana hayat kat</h3><div class="build-grid">${Object.entries(BUILDINGS).map(([key,b])=>`<button data-build="${key}" ${canBuild(p,key)?'':'disabled'} title="${canBuild(p,key)?b.name:'İmar planı bu kullanıma izin vermiyor'}"><span>${b.icon}</span><strong>${b.name}</strong><small>${canBuild(p,key)?fmt(b.cost)+' ◈':'İzin gerekli'}</small></button>`).join('')}</div>`:p.building!=='farm'&&p.level<zone.floors?`<button class="primary" id="upgrade">Bir kat ekle <span>${fmt(upgradePrice(p))} ◈</span></button>`:'')+`<button class="secondary" id="list">${icon('shop')} ${p.listing?'İlanı kaldır':'Satışa çıkar'}</button>`:buyable?`<div class="price-row"><span>${p.listing?'İlan fiyatı':'Dijital parsel bedeli'}<small>1 jeton = 1 ₺</small></span><strong>${fmt(p.listing||p.value)} <small>◈</small></strong></div><button class="primary" id="buy">${user?'Jetonla satın al':'Giriş yap ve satın al'} ${icon('arrow')}</button>`:'<div class="empty">Bu dijital parsel başka bir oyuncuya ait ve satışta değil.</div>'}</div><p class="source-note" id="detail-note"></p>`;
 $('#detail-note').textContent=(owned?'Bu dijital parsel sana ait. ':'')+'Sınırlar, fiyatlar, izinler ve söylentiler oyun içindir. Gerçek tapu veya belediye verisi değildir.';
 $('#model-preview')?.addEventListener('click',async()=>{modal('<h2>Arsanda küçük bir hayat.</h2><div id="model-view" style="height:300px;border-radius:14px;overflow:hidden"></div><p class="source-note">Temsili oyun modeli · Sürükleyerek döndür, kaydırarak yakınlaş.</p>');try{const {createWorld}=await import('./world.js');if(!$('#modal').open||!$('#model-view'))return;const preview=createWorld($('#model-view'),()=>{});preview.render({plots:[{id:1,x:0,z:0,type:p.building==='shop'?'cafe':p.building,level:Math.max(1,p.level),floors:p.level,onlyFarm:p.building==='farm',owner:'you'}]});preview.focus(1);preview.zoom(.4);$('#modal').addEventListener('close',()=>preview.dispose(),{once:true});}catch{toast('3D model bu tarayıcıda açılamadı.');}});
 $('#back').onclick=()=>{selected=null;map?.select(null);draw();};$('#show-map').onclick=()=>{map?.select(selected,true);$('.map-panel').scrollIntoView({behavior:'smooth'});};
 $('#buy')?.addEventListener('click',()=>p.listing?startListedPurchase(p):confirmAction('buy',p.value));
 $('#upgrade')?.addEventListener('click',()=>confirmAction('upgrade',upgradePrice(p)));
 document.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>confirmAction('build',BUILDINGS[b.dataset.build].cost,{type:b.dataset.build}));
 document.querySelectorAll('[data-crop]').forEach(b=>b.onclick=()=>run('plant',{crop:b.dataset.crop}));
 $('#harvest')?.addEventListener('click',()=>run('harvest'));
 $('#collect-rent')?.addEventListener('click',()=>run('rent'));
 $('#list')?.addEventListener('click',()=>{if(p.listing){run('unlist');return;}if(!account_.stripeOnboardingComplete)return openSellerSetup();modal(`<h2>Yeni bir hikâyeye yer aç.</h2><p>İlan fiyatı jeton olarak görünür. Satış gerçekleşince alıcı Stripe ile öder; %10 platform komisyonu ayrılır ve kalan %90 Stripe hesabına aktarılır.</p><form id="listing"><label>Satış fiyatı (jeton)<input name="price" type="number" min="10" max="1000000" step="1" required value="${p.value}"></label><button class="primary">İlanı yayınla</button></form>`);$('#listing').onsubmit=e=>{e.preventDefault();run('list',{price:Number(new FormData(e.target).get('price'))});};});
}

function startListedPurchase(p){
 if(!online)return toast('Sunucu bağlantısı yapılandırılmadı.');
 if(!user)return openAccount();
 const price=Number(p.listing||0),fee=Math.floor(price*10/100),seller=price-fee;
 modal(`<span class="modal-icon">${icon('shop')}</span><h2>Bu parseli satın al.</h2><p><strong>${fmt(price)} jeton</strong> karşılığı kartla ödeme yapacaksın. Bu ödeme oyun jeton bakiyenden düşmez.</p><div class="facts"><div><small>Toplam ödeme</small><strong>${money(price)}</strong></div><div><small>Platform komisyonu</small><strong>${fmt(fee)} jeton · %10</strong></div><div><small>Satıcıya aktarılacak</small><strong>${fmt(seller)} jeton · %90</strong></div></div><p class="source-note">Stripe ödemeyi onaylayınca parsel otomatik olarak sana geçer. Satıcının banka ödemesi Stripe kurallarına göre yapılır.</p><button class="primary" id="stripe-buy">Stripe ile güvenli öde ${icon('arrow')}</button>`);
 $('#stripe-buy').onclick=async()=>{const button=$('#stripe-buy');button.disabled=true;try{const {url}=await startParcelCheckout(p.id);location.href=url;}catch(e){toast(e.message);button.disabled=false;}};
}

function openSellerSetup(){
 if(!user)return openAccount();
 modal(`<div class="google-auth"><span class="modal-icon">${icon('wallet')}</span><div class="gift-kicker">STRIPE SATICI HESABI</div><h2>Satış için hesabını bağla.</h2><p>Stripe kısa bir doğrulama formu açacak. Banka hesabın doğrulanınca ilan verebilir ve satış gelirini alabilirsin.</p><p class="source-note">Her satışta %10 platform komisyonu kesilir; kalan %90 senin bağlı Stripe hesabına gider. Bu oyun parselleri gerçek taşınmaz değildir.</p><button class="primary" id="connect-start">Stripe bağlantısını başlat ${icon('arrow')}</button></div>`);
 $('#connect-start').onclick=async()=>{const button=$('#connect-start');button.disabled=true;try{const {url}=await startConnectOnboarding();location.href=url;}catch(e){toast(e.message);button.disabled=false;}};
}

// ---------------------------------------------------------------- actions
function confirmAction(action,cost,data={}){
 if(!online)return toast('Sunucu bağlantısı yapılandırılmadı.');
 if(!user)return openAccount();
 const short=state.balance<cost;
 modal(`<span class="modal-icon">${icon(action==='buy'?'grid':'home')}</span><h2>${action==='buy'?'Hikâyen burada başlasın.':'Arsana yeni bir hayat.'}</h2><p><strong>${fmt(cost)} jeton</strong> (${money(cost)}) harcanacak. İşlem sonrası bakiyen: <strong>${fmt(Math.max(0,state.balance-cost))} ◈</strong>.</p><p class="source-note">Jetonlar oyun içi kullanım içindir; nakde çevrilemez ve gerçek taşınmaz hakkı vermez.</p><button id="confirm" class="primary" ${short?'disabled':''}>${short?'Yetersiz bakiye':'Onayla ve devam et'} ${icon('arrow')}</button>${short?`<button class="secondary" id="to-wallet">${icon('wallet')} Jeton yükle</button>`:''}`);
 $('#confirm').onclick=()=>run(action,data);
 $('#to-wallet')?.addEventListener('click',openWallet);}

async function run(action,data={}){
 if(busy)return;
 if(!online)return toast('Sunucu bağlantısı yapılandırılmadı.');
 if(!user)return openAccount();
 busy=true;const buttons=[...document.querySelectorAll('#modal button,#actions button')];buttons.forEach(b=>b.disabled=true);
 try{
  const result=await act(action,selected,data);
  if(Number.isFinite(result.balance))state.balance=Number(result.balance);
  if(result.parcel)state.holdings[result.parcel.id]={owner:result.parcel.owner_id,building:result.parcel.building||null,level:result.parcel.level||0,listing:result.parcel.listing||null,crop:result.parcel.crop||null,cropReadyAt:result.parcel.crop_ready_at||null,rentLastCollected:result.parcel.rent_last_collected||null,rentPrice:result.parcel.rent_price||null};
  map?.render(state);draw();renderRecent();loadRecentParcels();$('#modal').close();
  toast({buy:'Bu dijital parsel artık senin. 🌱',build:'Arsana yeni bir hayat geldi!',upgrade:'Binana bir kat eklendi.',list:'İlanın yayınlandı.',unlist:'İlan kaldırıldı.',plant:'Ürün ekildi. Yarın hasat edebilirsin. 🌱',harvest:`Hasat tamamlandı. +${result.reward||0} jeton kazandın!`,rent:`Kira toplandı. +${result.reward||0} jeton kazandın!`}[action]);
 }catch(e){toast(e.message);buttons.forEach(b=>b.disabled=false);}
 finally{busy=false;}}

// ---------------------------------------------------------------- account and jetons
function openWelcomeWheel(){
 if(!user)return openAccount();
 if(account_.welcomeGiftClaimed){toast('Hoş geldin hediyeni zaten aldın. 🌱');return;}
 modal(`<div class="gift-modal"><div class="gift-kicker">İLK GİRİŞ HEDİYESİ</div><h2>Türkiye’den küçük bir yer senin olsun.</h2><p>Çarkı yalnızca bir kez çevirebilirsin. Sistem boş bir dijital parseli rastgele seçip kalıcı olarak hesabına tanımlayacak.</p>
  <div class="gift-wheel-wrap"><i class="gift-pointer"></i><div class="gift-wheel" id="gift-wheel"><span>🌾</span><span>🏡</span><span>🌳</span><span>🌻</span><span>⛰️</span><span>🍀</span><span>🌱</span><span>☀️</span><b>?</b></div></div>
  <div class="gift-status" id="gift-status" aria-live="polite">Şanslı toprağın seni bekliyor.</div>
  <button class="primary gift-spin" id="gift-spin">Çarkı çevir <span>Ücretsiz</span></button>
  <p class="source-note">Hediye gerçek taşınmaz değildir. Oyun içindeki dijital parsel mülkiyetine kaydedilir ve daha sonra oyunda kullanılabilir veya satışa çıkarılabilir.</p></div>`);
 $('#gift-spin').onclick=async()=>{
  const button=$('#gift-spin'),wheel=$('#gift-wheel'),status=$('#gift-status');button.disabled=true;wheel.classList.add('spinning');status.textContent='Türkiye haritasında boş bir yer aranıyor…';
  try{
   const [result]=await Promise.all([claimWelcomeGift(),new Promise(r=>setTimeout(r,1800))]);
   wheel.classList.remove('spinning');wheel.style.transform=`rotate(${1440+Math.floor(Math.random()*360)}deg)`;
   const row=result.parcel;if(!row?.id)throw Error('Hediye parsel yanıtı okunamadı.');
   account_.welcomeGiftClaimed=true;account_.welcomeGiftParcelId=row.id;
   state.holdings[row.id]={owner:row.owner_id,building:row.building||null,level:row.level||0,listing:row.listing||null,crop:row.crop||null,cropReadyAt:row.crop_ready_at||null,rentLastCollected:row.rent_last_collected||null,rentPrice:row.rent_price||null};
   map?.render(state);draw();renderRecent();loadRecentParcels();
   setTimeout(()=>{const p=safeGet(row.id);modal(`<div class="gift-result"><span>🌱</span><div class="gift-kicker">${result.wasNew?'ÇARKTAN ÇIKTI':'HESABINDAKİ HEDİYE'}</div><h2>İlk dijital arsan artık senin.</h2><p><strong>${esc(p?.district||'Türkiye')}</strong> çevresinde yaklaşık <strong>${fmt(p?.area||row.area)} m²</strong> bir oyun parseli hesabına kaydedildi.</p><button id="gift-go" class="primary">Arsama git ${icon('arrow')}</button><p class="source-note">Parsel: ${esc(row.id)} · Bu çark artık hesabında görünmeyecek.</p></div>`);$('#gift-go').onclick=()=>{$('#modal').close();tab='mine';select(row.id,true);};},450);
  }catch(error){wheel.classList.remove('spinning');wheel.style.transform='';status.textContent=error.message;button.disabled=false;}
 };
}

function openAccount(){
 if(!online)return modal('<h2>Sunucu bağlı değil.</h2><p>Bu kopya Supabase bağlantısı olmadan yayınlandı. Haritayı ve parselleri gezebilirsin; hesap ve jeton işlemleri için <code>VITE_SUPABASE_URL</code> ve <code>VITE_SUPABASE_ANON_KEY</code> tanımlanmalı.</p>');
 if(user)return modal(`<h2>Merhaba, ${esc(account_.name||'komşu')}.</h2><p>Bakiyen <strong>${fmt(state.balance)} jeton</strong> (${money(state.balance)}).</p>${account_.welcomeGiftClaimed?'':`<button id="account-gift" class="primary">🎁 Hediye çarkını çevir</button>`}${account_.stripeOnboardingComplete?`<p class="stripe-ready">✓ Stripe satıcı hesabın hazır. Satış gelirleri otomatik aktarılır.</p>`:`<button id="seller-setup" class="secondary">${icon('wallet')} Stripe satıcı hesabını bağla</button>`}<button id="to-wallet" class="primary">${icon('wallet')} Jeton yükle</button><button id="logout" class="secondary">Çıkış yap</button>`),
  $('#account-gift')?.addEventListener('click',openWelcomeWheel),
  $('#seller-setup')?.addEventListener('click',openSellerSetup),
  $('#to-wallet').onclick=openWallet,
  $('#logout').onclick=async()=>{await logout();$('#modal').close();toast('Çıkış yapıldı.');};
 modal(`<div class="google-auth"><span class="modal-icon">G</span><div class="gift-kicker">TEK GİRİŞ YÖNTEMİ</div><h2>Google hesabınla giriş yap.</h2><p class="muted">Telefon ücreti yok. Her Google hesabı Supabase’de tek bir oyun hesabına bağlanır.</p><button class="primary" id="google-auth">G&nbsp;&nbsp; Google ile devam et ${icon('arrow')}</button><p class="source-note">Bu uygulamada yalnızca Google girişi kullanılabilir. İlk girişte bir kez ücretsiz dijital arsa çarkı açılır.</p></div>`);
 const button=$('#google-auth');
 button.onclick=async()=>{button.disabled=true;try{await signInWithGoogle();}catch(err){toast(err.message);button.disabled=false;}};
}

function openWallet(){
 if(!online)return openAccount();
 if(!user)return openAccount();
 modal(`<div class="topup">
  <h2>Jeton yükle.</h2>
  <div class="topup-balance"><div><small>Bakiyen</small><strong>${fmt(state.balance)} ◈</strong></div><span>1 jeton = 1 ₺</span></div>
  <div class="quick-buy">
   <div class="quick-head"><span class="quick-flash">⚡</span><div><strong>Hızlı alım</strong><small>Tek dokunuşla yükle, anında harcamaya başla</small></div></div>
   <div class="pack-grid">${PACKS.map(pack=>`<button class="pack${pack.best?' pack-best':''}" data-pack="${pack.id}">
    ${pack.best?'<em class="pack-ribbon">En avantajlı</em>':bonus(pack)>0?`<em class="pack-ribbon pack-ribbon-soft">+%${bonus(pack)} jeton</em>`:''}
    <strong class="pack-jetons">${fmt(pack.jetons)} <span>◈</span></strong>
    <span class="pack-price">${money(lira(pack.kurus))}</span>
    <small class="pack-note">${pack.note}</small>
    <span class="pack-rate">${bonus(pack)>0?`%${bonus(pack)} hediye jeton`:'1 ₺ = 1 jeton'}</span>
   </button>`).join('')}</div>
  </div>
  <div class="custom-topup">
   <div><strong>Serbest miktar</strong><small>Kaç jeton yazarsan o kadar TL ödersin.</small></div>
   <form id="custom-topup-form"><label><input name="jetons" type="number" min="1" max="100000" step="1" inputmode="numeric" placeholder="Örn. 1000" required><span>jeton</span></label><button class="primary" type="submit">Stripe ile devam et ${icon('arrow')}</button></form>
  </div>
  <p class="source-note">Ödeme Stripe üzerinden alınır; kart bilgilerin bu siteye hiç uğramaz. Jetonlar yalnızca oyun içinde kullanılır, nakde çevrilemez ve gerçek taşınmaz hakkı vermez. Yükleme birkaç saniye içinde bakiyene işlenir.</p>
 </div>`);
 document.querySelectorAll('[data-pack]').forEach(b=>b.onclick=async()=>{
  document.querySelectorAll('[data-pack]').forEach(x=>x.disabled=true);
  try{const {url}=await startCheckout(b.dataset.pack);location.href=url;}
  catch(e){toast(e.message);document.querySelectorAll('[data-pack]').forEach(x=>x.disabled=false);}});
 const customForm=$('#custom-topup-form');
 customForm.onsubmit=async e=>{e.preventDefault();const button=customForm.querySelector('button'),jetons=Number(new FormData(customForm).get('jetons'));
  if(!Number.isSafeInteger(jetons)||jetons<1||jetons>100000)return toast('1–100.000 arasında tam sayı gir.');
  button.disabled=true;try{const {url}=await startCustomCheckout(jetons);location.href=url;}
  catch(err){toast(err.message);button.disabled=false;}};}

$('#account').onclick=openAccount;
$('#wallet').onclick=openWallet;

// ---------------------------------------------------------------- map chrome
function normalize(s){return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i');}
$('#search-form').onsubmit=e=>{e.preventDefault();const q=$('#search').value.trim(),coord=q.match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);if(coord){const lat=+coord[1],lon=+coord[2];if(lon<25.5||lon>45||lat<35.7||lat>42.3)return toast('Türkiye içinde enlem, boylam gir.');map?.go([lon,lat],16);$('#results').hidden=true;return;}if(q.length<2)return;const terms=normalize(q).split(/\s+/);const results=places.filter(p=>terms.every(t=>normalize(p.label).includes(t))).slice(0,15);$('#results').hidden=false;$('#results').innerHTML=results.length?results.map((p,i)=>`<button data-result="${i}">${icon('pin')}<span><strong>${esc(p.name)}</strong><small>${esc(p.label)}</small></span>↗</button>`).join(''):'<p>İl veya ilçe bulunamadı. Mahalle isimlerini haritada yakınlaşarak görebilirsin; koordinatla da gidebilirsin.</p>';$('#results').querySelectorAll('button').forEach(b=>b.onclick=()=>{const p=results[+b.dataset.result];map?.go(p.loc,p.zoom);$('#search').value=p.label;$('#results').hidden=true;});};
$('#search').onkeydown=e=>{if(e.key==='Escape')$('#results').hidden=true;};
document.querySelectorAll('[data-hot]').forEach(b=>b.onclick=()=>map?.go(HOTSPOTS[+b.dataset.hot].loc));
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{map?.mode(b.dataset.mode);document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;selected=null;map?.select(null);draw();if(tab==='market')loadMarket();if(tab==='mine'&&user)syncAccount(user);});
$('#turkey').onclick=()=>map?.home();
$('#grid').onclick=e=>{const on=map?.grid();e.currentTarget.setAttribute('aria-pressed',String(on));toast(on?'Dijital parseller gösteriliyor.':'Parseller gizlendi.');};
$('#tilt').onclick=()=>map?.tilt();
$('#help').onclick=()=>modal(`<h2>Gerçek harita.<br>Dijital bir oyun.</h2><ol><li>İl veya ilçe ara. Sokak ve mahalleleri görmek için yakınlaş.</li><li>Renkli bir oyun parseli seç; şeklini, alanını, imar ve kat iznini incele.</li><li>Jetonla satın al: 1 jeton = 1 ₺ ve her metrekare 4 kuruştan başlar.</li><li>Tarım, konut veya ticaret iznine uygun bir kullanım seç.</li><li>Arsanı jeton karşılığında satışa çıkar; satılırsa jetonlar bakiyene geçer.</li></ol><p>Parseller her blokta farklı büyüklük ve şekilde üretilir ve kara üzerinde boşluk bırakmadan birleşir; denizde ve göllerde parsel yoktur. Sınırlar tapu sınırı değildir. İmarlı arsa mı yoksa tarla mı olduğu gerçek yerleşik alan verisi, ilçe nüfusu ve yoğunluğundan hesaplanır; belediyenin imar planı değildir. İşlemler gerçek taşınmaz hakkı vermez.</p><p class="source-note">Harita: <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap / OpenStreetMap</a>. Uydu: <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" target="_blank" rel="noopener">Esri World Imagery</a>. Kıyı sınırı: OpenStreetMap / geoBoundaries. Yerleşik alanlar: Natural Earth. İlçe nüfusu: TÜİK ADNKS derlemesi.</p>`);

// ---------------------------------------------------------------- start
draw();renderRecent();
try{
 const responses=await Promise.all([fetch('./data/land.json'),fetch('./data/places.json'),fetch('./data/landuse.json')]);
 if(responses.some(r=>!r.ok))throw Error('Coğrafi veri yüklenemedi.');
 const [land,cities,landuse]=await Promise.all(responses.map(r=>r.json()));
 if(!setLand(land))throw Error('Kara sınırı verisi okunamadı.');
 setLanduse(landuse);
 const boundary=landFeature();
 places=cities.flatMap(c=>[{name:c.name,label:c.name+' · İl',loc:[+c.longitude,+c.latitude],zoom:11},...(c.towns||[]).filter(t=>Number.isFinite(+t.longitude)&&Number.isFinite(+t.latitude)).map(t=>({name:t.name,label:t.name+' / '+c.name+' · İlçe',loc:[+t.longitude,+t.latitude],zoom:14.5}))]);
 available=true;
 map=createMap($('#map'),boundary,{status:s=>$('#map-status').textContent=s,select,
  visible:ids=>{visible=ids;if(!selected&&tab==='explore')draw();},
  viewport:loadViewport,
  error:msg=>{$('#map-error').hidden=false;$('#map-error').textContent=msg;},
  ready:()=>{$('#map-error').hidden=true;}});
 map.render(state);renderRecent();loadRecentParcels();
 if(online)setInterval(loadRecentParcels,45000);
 if(online){onAuthChange(syncAccount);await syncAccount(await currentUser());}
}catch(e){available=false;$('#map-error').hidden=false;$('#map-error').textContent=e.message+' Sayfayı yenileyerek tekrar dene.';$('#map-status').textContent='Harita bağlantısı bekleniyor';}

// Coming back from Stripe: the webhook credits the balance, so poll briefly until it lands.
if(online&&new URLSearchParams(location.search).get('odeme')==='tamam'){
 history.replaceState(null,'',location.pathname);
 toast('Ödemen alındı. Jetonların birazdan bakiyene işlenecek.');
 for(let attempt=0;attempt<8;attempt++){
  await new Promise(r=>setTimeout(r,1500));
  const before=state.balance;await syncAccount(await currentUser());
  if(state.balance>before){toast(`${fmt(state.balance-before)} jeton yüklendi. 🎉`);break;}}}

// Returning from Stripe Connect onboarding: ask the server for the current capability
// instead of trusting the redirect itself.
if(online&&user&&new URLSearchParams(location.search).get('stripe')==='donus'){
 try{const status=await startConnectOnboarding('status');await syncAccount(await currentUser());toast(status.connected?'Stripe satıcı hesabın hazır. İlan verebilirsin.':'Stripe formu henüz tamamlanmadı. Hesap bölümünden devam edebilirsin.');}
 catch(e){toast(e.message);}finally{history.replaceState(null,'',location.pathname);}}
