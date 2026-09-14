import * as THREE from 'three';
const styles=['Verandalı ev','Ege taş evi','Dağ evi','Teraslı ev','Avlulu ev','Cumbalı ev','Kuleli ev','Bahçe villası'];
const tones=['Adaçayı','Şeftali','Lavanta'];
export const HOME_MODELS=styles.flatMap((name,style)=>tones.map((tone,palette)=>({id:style*3+palette,name:`${tone} · ${name}`,style,palette})));
const palettes=[[0xdce5c5,0x79988a],[0xf2d7be,0xbe8e7a],[0xe0d8eb,0x929aaf]];
const geometries={box:new THREE.BoxGeometry(1,1,1),ball:new THREE.SphereGeometry(1,8,6),cone:new THREE.ConeGeometry(1,1,4),round:new THREE.CylinderGeometry(1,1,1,8)};
const materials=new Map();
function material(c){if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.92}));return materials.get(c);}
export function createHomeModel(model=0,level=1,floors=1){
 const spec=HOME_MODELS[model]||HOME_MODELS[0],style=spec.style,[wall,roof]=palettes[spec.palette],cream=0xfff5df,wood=0xad8972,glass=0x9dc6cc;
 level=Math.max(1,Math.min(5,level));floors=Math.max(1,Math.min(5,floors));
 const g=new THREE.Group();g.userData={model:spec.id,level,floors};
 function add(kind,x,y,z,w,h,d,color){const m=new THREE.Mesh(geometries[kind],material(color));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;m.userData.sharedHome=true;g.add(m);return m;}
 const box=(x,y,z,w,h,d,c)=>add('box',x,y,z,w,h,d,c);
 const sphere=(x,y,z,r,c)=>add('ball',x,y,z,r,r,r,c);
 function window(x,y,z){box(x,y,z,.68,.78,.1,cream);box(x,y,z+.065,.5,.6,.035,glass);box(x,y,z+.09,.035,.6,.02,cream);}
 function pitched(x,y,z,w,d){const a=box(x-w/4,y,z,w*.59,.16,d,roof);a.rotation.z=.5;const b=box(x+w/4,y,z,w*.59,.16,d,roof);b.rotation.z=-.5;}
 box(0,.08,0,6.4,.16,6.4,0xbfd4a5);box(0,.17,2.4,1,.08,1.7,cream);
 const width=style===2?2.8:style===6?3:3.8,depth=style===4?2.3:3.2,h=1.8*floors;
 for(let f=0;f<floors;f++){
  box(0,1+f*1.8,-.35,width,1.78,depth,wall);box(0,.2+f*1.8,-.35,width+.15,.13,depth+.12,cream);
  for(const x of [-width*.3,width*.3])window(x,1.15+f*1.8,depth/2-.3);
  box(width/2+.02,1.15+f*1.8,-.45,.05,.64,.7,glass);
 }
 box(0,.84,depth/2-.25,.65,1.4,.15,wood);sphere(.2,.85,depth/2-.14,.04,cream);
 if([0,1,5,7].includes(style))pitched(0,h+.55,-.35,width+.5,depth+.5);
 if(style===2){pitched(0,h+.8,-.35,4,depth+.6);for(const x of [-1.4,1.4])box(x,h*.55,-.35,.15,h,depth,wood);}
 if(style===3){box(0,h+.25,-.35,width+.35,.22,depth+.3,cream);box(-width/2,h+.52,-.35,.1,.5,depth,wall);}
 if(style===4){pitched(0,h+.5,-.35,width+.4,depth+.4);box(-1.7,.95,1.1,1.1,1.6,2.1,wall);pitched(-1.7,2,1.1,1.35,2.35);box(1.7,.95,1.1,1.1,1.6,2.1,wall);pitched(1.7,2,1.1,1.35,2.35);}
 if(style===5){box(.9,1.3,1.4,1.5,1.2,.8,wall);window(.9,1.4,1.85);box(.9,2,1.4,1.7,.15,1,roof);}
 if(style===6){box(1.5,h/2+.4,-.8,1.5,h+.5,1.6,wall);const top=add('cone',1.5,h+1.2,-.8,1.35,1.3,1.35,roof);top.rotation.y=Math.PI/4;pitched(-.2,h+.5,0,3.2,3.4);}
 if(style===7){box(-1.8,.9,-1.6,1.8,1.5,1.7,wall);pitched(-1.8,1.9,-1.6,2.1,2);}
 // Porch, chimney, shutters and landscaping distinguish each family.
 if(style===0||level>=2){box(0,.3,1.8,4.4,.16,1.4,cream);for(const x of [-2,2])box(x,1.1,2.2,.09,1.7,.09,cream);box(0,2,1.8,4.4,.12,1.4,roof);}
 if(style===1){for(let i=0;i<5;i++)box(-1.88,.4+i*.32,0,.07,.12,2.8,0xc4b59f);}
 if(level>=2){for(const x of [-2.6,2.6]){box(x,.6,-2.1,.12,1.1,.12,wood);sphere(x,1.3,-2.1,.6,0x91b585);}}
 if(level>=3){box(1,h+.6,-1,.4,1,.45,cream);box(1,h+1.13,-1,.52,.13,.55,wood);for(const x of [-2.6,2.6]){box(x,.3,1.8,.65,.35,.55,0xc69b7e);sphere(x,.6,1.8,.33,0xe5a8af);}}
 if(level>=4){box(0,.22,-2.5,3,.1,.65,cream);for(let x=-1.4;x<1.6;x+=.7)box(x,.5,-2.7,.08,.6,.08,cream);box(0,.7,-2.7,3,.07,.08,cream);}
 if(level>=5){const panel=box(-.8,h+.9,-.35,1.3,.1,1.4,0x718eab);panel.rotation.z=.5;add('round',2.35,.3,0,.45,.3,.45,0xadcfd0);sphere(2.35,.6,0,.15,0xd7e9dd);}
 return g;
}
