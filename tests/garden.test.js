import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,move,normalize,complete,level} from '../src/garden-state.js';
const now=Date.UTC(2026,8,14,12);
test('free planting requires clearing and watering; harvest matures and cannot repeat',()=>{
 let s=fresh(now);
 assert.throws(()=>move(s,'plant',0,0,now));
 s=move(s,'weed',0,0,now);s=move(s,'plant',0,0,now);
 assert.throws(()=>move(s,'harvest',0,0,now+46000));
 s=move(s,'water',0,0,now);
 assert.throws(()=>move(s,'water',0,0,now));
 assert.throws(()=>move(s,'harvest',0,0,now+1000));
 s=move(s,'harvest',0,0,now+46000);
 assert.equal(s.collection[0],1);assert.equal(s.tiles[0],null);
 assert.throws(()=>move(s,'harvest',0,0,now+46000));
});
test('daily reward is earned once and daily reset preserves plants and collection',()=>{
 let s=fresh(now);
 for(let i=0;i<3;i++){for(const a of ['weed','plant','water'])s=move(s,a,i,0,now);s=move(s,'harvest',i,0,now+46000);}
 assert.ok(complete(s));s=move(s,'claim',0,0,now+46000);assert.ok(level(s)>=2);
 assert.throws(()=>move(s,'claim',0,0,now+46000));
 s=move(s,'plant',0,0,now+47000);
 const tomorrow=normalize(s,now+86400000);
 assert.equal(tomorrow.claimed,false);assert.equal(tomorrow.tasks.harvest,0);assert.equal(tomorrow.collection[0],3);assert.ok(tomorrow.tiles[0]);
});
test('advanced seeds require levels and rules do not mutate original state',()=>{
 const s=move(fresh(now),'weed',0,0,now);assert.throws(()=>move(s,'plant',0,5,now));
 const planted=move(s,'plant',0,0,now);assert.equal(s.tiles[0],null);assert.ok(planted.tiles[0]);
 assert.equal('balance' in planted,false);
});
