export const TYPES = {
 farm:{name:'Çiftlik evi',icon:'🌾',cost:450,color:'#e9c4a8',description:'Bir veranda, küçük bir bahçe ve meraklı hayvanlar.'},
 home:{name:'Bahçeli ev',icon:'🏡',cost:650,color:'#c8d8af',description:'Ağaçların arasında, tam sana göre bir yuva.'},
 cafe:{name:'Mahalle kafesi',icon:'☕',cost:850,color:'#e4b1a7',description:'Kahve kokusu ve uzun sohbetlerin yeni adresi.'},
 fuel:{name:'Benzin istasyonu',icon:'⛽',cost:1100,color:'#adc9d3',description:'Yoldan geçenlerin küçük mola noktası.'}
};
export const LEVELS=['','Küçük başlangıç','İki katlı ev','Şehir apartmanı','Modern rezidans','Gökdelen'];
export function price(p){return Math.round(350+Math.max(0,6-Math.abs(p.x)-Math.abs(p.z))*85+(p.z===0?120:0));}
export function upgradeCost(p){return 450*p.level*p.level;}
export function initialWorld(){
 const plots=[];let id=1;
 for(let z=-1;z<=1;z++)for(let x=-1;x<=2;x++){
  const types=['farm',null,'home',null,'cafe','home',null,'fuel',null,'farm',null,'home'];const type=types[id-1];
  plots.push({id:id++,x,z,type,level:type?1:0,owner:type?'neighbor':null,ownerName:type?['Deniz','Ece','Ada','Mert'][id%4]:null,listing:id===7?980:null});
 }
 return {plots,revision:1};
}
export function expand(world){
 const occupied=new Set(world.plots.map(p=>`${p.x},${p.z}`));
 const candidates=[];
 for(const p of world.plots)for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1]]){const x=p.x+dx,z=p.z+dz;if(!occupied.has(`${x},${z}`))candidates.push({x,z});}
 candidates.sort((a,b)=>(Math.abs(a.x)+Math.abs(a.z))-(Math.abs(b.x)+Math.abs(b.z))||a.z-b.z||a.x-b.x);
 const p=candidates[0];if(p)world.plots.push({id:Math.max(...world.plots.map(p=>p.id))+1,...p,type:null,level:0,owner:null,ownerName:null,listing:null});
}
export function demoAction(state,action,id,data={}){
 const p=state.plots.find(p=>p.id===id);if(!p)throw Error('Arsa bulunamadı.');let cost=0;
 if(action==='buy'){
  if(p.owner==='you')throw Error('Burası zaten senin.');
  if(p.owner&&!p.listing)throw Error('Bu yer satışta değil.');cost=p.listing||price(p);
 }else{
  if(p.owner!=='you')throw Error('Önce bu arsayı satın almalısın.');
  if(action==='build'){if(p.type)throw Error('Burada zaten bir bina var.');if(!TYPES[data.type])throw Error('Bina türünü seç.');cost=TYPES[data.type].cost;}
  else if(action==='upgrade'){if(!p.type||p.level>=5)throw Error('Bu bina daha fazla yükseltilemez.');cost=upgradeCost(p);}
  else if(action==='list'){if(!Number.isSafeInteger(data.price)||data.price<100||data.price>1000000)throw Error('100–1.000.000 arasında tam sayı gir.');}
  else if(action!=='unlist')throw Error('Geçersiz işlem.');
 }
 if(state.balance<cost)throw Error('Yeterli demo bakiyen yok.');state.balance-=cost;
 if(action==='buy'){p.owner='you';p.ownerName='Sen';p.listing=null;if(!p.type)expand(state);}
 if(action==='build'){p.type=data.type;p.level=1;}
 if(action==='upgrade')p.level++;
 if(action==='list')p.listing=data.price;
 if(action==='unlist')p.listing=null;
 return p;
}
