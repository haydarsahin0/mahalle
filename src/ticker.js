export function relativeAge(value,now=Date.now()){
 const timestamp=value?Date.parse(value):NaN;
 if(!Number.isFinite(timestamp))return 'Zaman bilinmiyor';
 const minutes=Math.max(0,Math.floor((now-timestamp)/60000));
 if(minutes<1)return 'Az önce';
 if(minutes<60)return `${minutes} dakika önce`;
 if(minutes<1440)return `${Math.floor(minutes/60)} saat önce`;
 return `${Math.floor(minutes/1440)} gün önce`;
}

export function createTicker(root,onSelect){
 // A real layout row: never cover the map or sit inside its clipping container.
 document.querySelector('header').after(root);
 const track=root.querySelector('.ticker-track'),window_=root.querySelector('.ticker-window');
 const pause=document.createElement('button');
 pause.className='ticker-pause';pause.type='button';pause.textContent='Ⅱ';
 pause.setAttribute('aria-label','Akışı duraklat');pause.setAttribute('aria-pressed','false');
 root.append(pause);
 let markup=null,animation=null,paused=false,touch=false,hover=false,focused=false;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 function playback(){
  if(paused||touch||hover||focused||document.hidden)animation?.pause();else animation?.play();
 }
 pause.onclick=()=>{paused=!paused;pause.textContent=paused?'▶':'Ⅱ';pause.setAttribute('aria-pressed',String(paused));pause.setAttribute('aria-label',paused?'Akışı sürdür':'Akışı duraklat');playback();};
 window_.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hover=true;playback();}});
 window_.addEventListener('pointerleave',()=>{hover=false;playback();});
 window_.addEventListener('pointerdown',()=>{touch=true;playback();});
 for(const event of ['pointerup','pointercancel'])window.addEventListener(event,()=>{touch=false;playback();});
 window_.addEventListener('focusin',()=>{focused=true;playback();});
 window_.addEventListener('focusout',()=>{focused=false;playback();});
 root.addEventListener('click',e=>{const card=e.target.closest('[data-recent-parcel]');if(card)onSelect(card.dataset.recentParcel);});
 function times(){root.querySelectorAll('[data-time]').forEach(t=>{
  t.textContent=relativeAge(t.dataset.time);
  if(Number.isFinite(Date.parse(t.dataset.time)))t.dateTime=new Date(t.dataset.time).toISOString();
 });}
 function layout(){
  animation?.cancel();animation=null;
  const set=track.firstElementChild;
  if(!set||!markup)return;
  while(track.children.length>1)track.lastElementChild.remove();
  const width=set.getBoundingClientRect().width;
  if(!width||motion.matches)return;
  // Repeat enough sets to cover even a wide screen with only one real record.
  const copies=Math.ceil(window_.clientWidth/width)+1;
  for(let i=0;i<copies;i++){
   const clone=set.cloneNode(true);clone.setAttribute('aria-hidden','true');
   clone.querySelectorAll('button').forEach(b=>b.tabIndex=-1);track.append(clone);
  }
  // Constant 22 px/s, independent of record count (about 12 s per card).
  animation=track.animate([{transform:'translateX(0)'},{transform:`translateX(-${width}px)`}],{duration:width/22*1000,iterations:Infinity,easing:'linear'});
  playback();
 }
 new ResizeObserver(layout).observe(window_);
 motion.addEventListener('change',layout);
 document.addEventListener('visibilitychange',()=>{times();playback();});
 setInterval(times,30000);
 document.fonts?.ready.then(layout);
 return {update(html){
  if(html===markup){times();return;}
  markup=html;
  animation?.cancel();
  track.innerHTML=html?`<div class="ticker-set">${html}</div>`:'<span class="ticker-empty">İlk dijital arsa senin olabilir. 🌱</span>';
  pause.hidden=!html;times();layout();
 }};
}
