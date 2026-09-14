import * as THREE from 'three';
import {createHomeModel} from './home-models.js';
import maplibregl from 'maplibre-gl';
export function createHomeLayer(){
 let renderer,scene,camera,origin,unit,signature='',enabled=true;
 const layer={id:'home-models',type:'custom',renderingMode:'3d',
 onAdd(map,gl){scene=new THREE.Scene();camera=new THREE.Camera();scene.add(new THREE.HemisphereLight(0xfff8ed,0x8fa478,2.5));const sun=new THREE.DirectionalLight(0xffffff,2.6);sun.position.set(-20,40,20);scene.add(sun);renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl});renderer.autoClear=false;},
 render(gl,args){if(!origin||!enabled)return;const m=new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);const local=new THREE.Matrix4().makeTranslation(origin.x,origin.y,origin.z).scale(new THREE.Vector3(unit,-unit,unit)).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2));camera.projectionMatrix=m.multiply(local);renderer.resetState();renderer.render(scene,camera);renderer.resetState();},
 onRemove(){renderer?.dispose();},
 setVisible(v){enabled=v;},
 update(parcels){if(!scene)return;const rows=parcels.filter(p=>p.building==='home').slice(0,100);const key=JSON.stringify(rows.map(p=>[p.id,p.homeModel,p.level,p.homeFloors]));if(key===signature)return;signature=key;for(const child of [...scene.children])if(child.isGroup)scene.remove(child);origin=null;if(!rows.length)return;origin=maplibregl.MercatorCoordinate.fromLngLat([rows[0].lon,rows[0].lat],1);unit=origin.meterInMercatorCoordinateUnits();
 for(const p of rows){const at=maplibregl.MercatorCoordinate.fromLngLat([p.lon,p.lat],1);const g=createHomeModel(p.homeModel||0,p.level||1,p.homeFloors||1);g.position.set((at.x-origin.x)/unit,0,(at.y-origin.y)/unit);g.scale.setScalar(Math.max(.6,Math.min(3,Math.sqrt(p.area)/16)));scene.add(g);}}
 };return layer;
}
