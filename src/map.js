import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {features,ringFor,coordinates} from './land.js';
const PARCEL_ZOOM=14;
const EMPTY={type:'FeatureCollection',features:[]};
export function createMap(container,boundary,callbacks){
 const map=new maplibregl.Map({container,style:'https://tiles.openfreemap.org/styles/liberty',center:[34.8,39.1],zoom:5.45,minZoom:4.5,maxZoom:20,maxBounds:[[24,34],[47,44]],attributionControl:true,renderWorldCopies:false});
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
 let state,selected,mode='satellite',showGrid=true,ready=false;
 const status=msg=>callbacks.status(msg);
 function update(){if(!ready||!state)return;let fc=EMPTY,wide=false;
  if(map.getZoom()>=PARCEL_ZOOM){const b=map.getBounds();
   const result=features([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],state.week,state.holdings);
   if(result)fc=result;else wide=true;}
  map.getSource('parcels').setData(fc);
  status(map.getZoom()<PARCEL_ZOOM||wide?'Parselleri görmek için yakınlaş'
   :fc.truncated?`${fc.features.length}+ parsel · Hepsini görmek için yakınlaş`
   :fc.features.length?`${fc.features.length} dijital parsel · Haritadan seç`
   :'Bu ölçekte parsel yok. Yakınlaş veya karaya ilerle.');
  callbacks.visible(fc.features.map(f=>f.properties.id));}
 map.on('load',()=>{map.addSource('satellite',{type:'raster',tiles:['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:18,attribution:'Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community'});const firstLabel=map.getStyle().layers.find(l=>l.type==='symbol')?.id;map.addLayer({id:'satellite',source:'satellite',type:'raster',paint:{'raster-saturation':-.25,'raster-contrast':-.08}},firstLabel);
 map.addSource('turkey',{type:'geojson',data:boundary});map.addLayer({id:'turkey-border',type:'line',source:'turkey',paint:{'line-color':'#ecebd9','line-width':['interpolate',['linear'],['zoom'],5,1.5,13,.9,17,.5],'line-opacity':['interpolate',['linear'],['zoom'],5,.75,13,.5,17,.28]}});
 map.addSource('parcels',{type:'geojson',data:EMPTY});map.addLayer({id:'parcel-fill',type:'fill',source:'parcels',paint:{'fill-color':['get','color'],'fill-opacity':['case',['==',['get','arsa'],1],.3,.2]}});map.addLayer({id:'parcel-lines',type:'line',source:'parcels',paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],14,.7,17,1.6],'line-opacity':.95}});map.addLayer({id:'parcel-buildings',type:'fill-extrusion',source:'parcels',filter:['>', ['get','height'],0],paint:{'fill-extrusion-color':['get','color'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':.8}});
 map.addSource('selected',{type:'geojson',data:EMPTY});map.addLayer({id:'selected-fill',type:'fill',source:'selected',paint:{'fill-color':'#fbe1a2','fill-opacity':.32}});map.addLayer({id:'selected-line',type:'line',source:'selected',paint:{'line-color':'#fff1c7','line-width':3}});
 map.on('click','parcel-fill',e=>{if(showGrid&&e.features?.length)callbacks.select(e.features[0].properties.id);});map.on('mouseenter','parcel-fill',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','parcel-fill',()=>map.getCanvas().style.cursor='');ready=true;setMode(mode);update();if(selected)select(selected);callbacks.ready();});
 map.on('moveend',update);let lastError=0;map.on('error',e=>{if(Date.now()-lastError>10000){lastError=Date.now();callbacks.error('Harita katmanı yüklenemedi. İnternetini kontrol et veya Sokak görünümünü dene.');}});
 function setMode(value){mode=value;if(!ready)return;map.setLayoutProperty('satellite','visibility',mode==='satellite'?'visible':'none');for(const layer of map.getStyle().layers){if(layer.type==='symbol'&&layer.layout?.['text-field']){map.setPaintProperty(layer.id,'text-color',mode==='satellite'?'#fff9e8':'#505e54');map.setPaintProperty(layer.id,'text-halo-color',mode==='satellite'?'#34473a':'#fcfbf5');map.setPaintProperty(layer.id,'text-halo-width',1.5);}}}
 function select(id,fly=false){selected=id;if(!ready)return;map.getSource('selected').setData(id?{type:'Feature',geometry:{type:'Polygon',coordinates:[ringFor(id,.94)]},properties:{}}:EMPTY);if(fly&&id){const p=coordinates(id);map.flyTo({center:[p.lon,p.lat],zoom:Math.max(map.getZoom(),16.5),duration:1000});}}
 return {render(s){state=s;update();},select,mode:setMode,go(center,zoom=15.5){map.flyTo({center,zoom,duration:1400,essential:false});},home(){map.fitBounds([[25.6,35.8],[44.9,42.2]],{padding:65,duration:1200});},grid(){showGrid=!showGrid;if(ready)for(const id of ['parcel-fill','parcel-lines','parcel-buildings'])map.setLayoutProperty(id,'visibility',showGrid?'visible':'none');return showGrid;},tilt(){map.easeTo({pitch:map.getPitch()>10?0:55,bearing:map.getPitch()>10?0:-15,duration:900});},get ready(){return ready;}};
}
