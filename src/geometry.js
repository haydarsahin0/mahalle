// Polygon helpers shared by parcel generation, land tests and the real-world land-use index.
// Coordinates are [lon,lat] degrees; areas are metres squared on a local equirectangular plane.
export const METRE_LAT=110574;
export const metrePerLon=lat=>111320*Math.cos(lat*Math.PI/180);

export function hash(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
// Small deterministic generator: same seed always replays the same parcel layout.
export function rng(seed){let a=(seed>>>0)||1;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

export function bboxOf(ring){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of ring){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}return [x0,y0,x1,y1];}

export function centroid(ring){let a=0,cx=0,cy=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const f=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];a+=f;cx+=(ring[j][0]+ring[i][0])*f;cy+=(ring[j][1]+ring[i][1])*f;}
 if(!a)return ring[0].slice();return [cx/(3*a),cy/(3*a)];}

// A notched parcel can push its centroid outside the ring, so fall back to a point that is
// provably inside: parcel coordinates, land tests and map fly-to all rely on it.
export function insidePoint(ring){const c=centroid(ring);if(pointInRing(c,ring))return c;
 for(const p of ring){const m=lerp(c,p,.5);if(pointInRing(m,ring))return m;}
 for(let i=0;i<ring.length;i++){const m=lerp(ring[i],ring[(i+2)%ring.length],.5);if(pointInRing(m,ring))return m;}
 return c;}

// Signed area in square degrees; positive when the ring winds counter-clockwise.
export function signedArea(ring){let a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)a+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return a/2;}

export function perimetreM(ring){const lat=centroid(ring)[1],kx=metrePerLon(lat);let p=0;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++)p+=Math.hypot((ring[i][0]-ring[j][0])*kx,(ring[i][1]-ring[j][1])*METRE_LAT);
 return p;}

// 1 for a circle, ~0.79 for a square, towards 0 for a long splinter.
export function compactness(ring){const p=perimetreM(ring);return p?4*Math.PI*areaSqm(ring)/(p*p):0;}

export function areaSqm(ring){const lat=centroid(ring)[1];return Math.abs(signedArea(ring))*metrePerLon(lat)*METRE_LAT;}

export function pointInRing([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];
 if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}

// Distance from a point to a ring's outline, in metres.
export function distanceToRing([x,y],ring){const kx=metrePerLon(y),ky=METRE_LAT;let best=Infinity;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){const ax=(ring[j][0]-x)*kx,ay=(ring[j][1]-y)*ky,bx=(ring[i][0]-x)*kx,by=(ring[i][1]-y)*ky;
  const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;let t=len?((0-ax)*dx+(0-ay)*dy)/len:0;t=t<0?0:t>1?1:t;
  const px=ax+dx*t,py=ay+dy*t,d=Math.hypot(px,py);if(d<best)best=d;}
 return best;}

// Ray casting over a whole ring is linear in its vertex count; Türkiye's coastline has
// thousands of them, so edges are bucketed into latitude bands and only the band is scanned.
const BAND=0.02;
export function indexRing(ring){const bands=new Map(),box=bboxOf(ring);
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if(a[1]===b[1])continue;
  const lo=Math.floor(Math.min(a[1],b[1])/BAND),hi=Math.floor(Math.max(a[1],b[1])/BAND);
  for(let k=lo;k<=hi;k++){let list=bands.get(k);if(!list)bands.set(k,list=[]);list.push(a,b);}}
 return {bands,bbox:box,ring};}

export function indexedContains(index,[x,y]){const b=index.bbox;if(x<b[0]||x>b[2]||y<b[1]||y>b[3])return false;
 const list=index.bands.get(Math.floor(y/BAND));if(!list)return false;let inside=false;
 for(let i=0;i<list.length;i+=2){const [xj,yj]=list[i],[xi,yi]=list[i+1];
  if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}
 return inside;}

// True when segments ab and cd cross at a point interior to both.
function crosses(a,b,c,d){const s=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
 const d1=s(a,b,c),d2=s(a,b,d),d3=s(c,d,a),d4=s(c,d,b);
 return d1!==d2&&d3!==d4&&d1!==0&&d2!==0&&d3!==0&&d4!==0;}

// Cuts a simple polygon along a path that enters at edge i and leaves at edge j.
// Both pieces reuse the identical cut vertices, so the pair always retiles the parent exactly.
export function cutRing(ring,i,ti,j,tj,bulge=0){const n=ring.length;if(i===j)return null;
 const A=lerp(ring[i],ring[(i+1)%n],ti),B=lerp(ring[j],ring[(j+1)%n],tj);
 const path=[];
 if(bulge){const mid=lerp(A,B,.5),dx=B[0]-A[0],dy=B[1]-A[1];path.push([mid[0]-dy*bulge,mid[1]+dx*bulge]);}
 const nodes=[A,...path,B];
 for(let k=0;k<nodes.length-1;k++){const p=nodes[k],q=nodes[k+1];
  if(!pointInRing(lerp(p,q,.5),ring))return null;
  for(let e=0,f=n-1;e<n;f=e++){if(e===i||e===j||f===i||f===j)continue;if(crosses(p,q,ring[f],ring[e]))return null;}}
 if(path.length&&!pointInRing(path[0],ring))return null;
 const first=[A],second=[B];
 for(let k=(i+1)%n;;k=(k+1)%n){first.push(ring[k]);if(k===j)break;}
 first.push(B,...path.slice().reverse());
 for(let k=(j+1)%n;;k=(k+1)%n){second.push(ring[k]);if(k===i)break;}
 second.push(A,...path);
 const clean=r=>{const out=[];for(const p of r)if(!out.length||Math.abs(out[out.length-1][0]-p[0])>1e-12||Math.abs(out[out.length-1][1]-p[1])>1e-12)out.push(p);
  while(out.length>1&&Math.abs(out[0][0]-out[out.length-1][0])<1e-12&&Math.abs(out[0][1]-out[out.length-1][1])<1e-12)out.pop();return out;};
 const a=clean(first),b=clean(second);
 return a.length>2&&b.length>2?[a,b]:null;}

// Pulls a ring towards its centroid so neighbouring parcels stay visually separated.
export function shrink(ring,factor){if(factor>=1)return ring;const c=centroid(ring);
 return ring.map(p=>[c[0]+(p[0]-c[0])*factor,c[1]+(p[1]-c[1])*factor]);}

export const closed=ring=>[...ring.map(p=>[p[0],p[1]]),[ring[0][0],ring[0][1]]];
