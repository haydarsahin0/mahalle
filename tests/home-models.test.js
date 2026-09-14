import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {createHomeModel,HOME_MODELS} from '../src/home-models.js';
import {homeValue} from '../src/land.js';
test('24 named models have valid bounded geometry at every level',()=>{
 assert.equal(HOME_MODELS.length,24);assert.equal(new Set(HOME_MODELS.map(m=>m.name)).size,24);
 for(const model of HOME_MODELS)for(let level=1;level<=5;level++){
 const g=createHomeModel(model.id,level,level),b=new Box3().setFromObject(g),size=b.getSize(new Vector3());
 assert.ok(size.x>3&&size.x<9);assert.ok(size.z>3&&size.z<9);assert.ok(size.y>1&&size.y<14);assert.ok(g.children.length<130);
 }
});
test('single floor homes get visible upgrades without gaining floors',()=>{
 const base=createHomeModel(3,1,1),improved=createHomeModel(3,5,1);
 assert.equal(improved.userData.floors,1);assert.ok(improved.children.length>base.children.length);
});
test('home value is bounded and disappears with demolition',()=>{
 assert.equal(homeValue({building:'home',level:1}),60);assert.equal(homeValue({building:'home',level:5}),300);assert.equal(homeValue({building:null,level:5}),0);
});
