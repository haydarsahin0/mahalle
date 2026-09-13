import test from 'node:test';
import assert from 'node:assert/strict';
import {accountBinding} from '../src/browser-account.js';
test('first verified account stays bound across new instances; another account is rejected',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const a={id:'a',identities:[{provider:'google',identity_data:{sub:'google-a'}}]};
 assert.equal(accountBinding(storage).accept(a),true);
 assert.equal(accountBinding(storage).read().hint,'google-a');
 assert.equal(accountBinding(storage).accept({id:'b'}),false);
 assert.equal(accountBinding(storage).accept(a),true);
 assert.equal(accountBinding(storage).accept(null),false);
 assert.equal(accountBinding(storage).read().id,'a');
});
test('storage denial cannot silently accept a new binding',()=>{
 const binding=accountBinding({getItem:()=>null,setItem:()=>{throw Error('denied');}});
 assert.throws(()=>binding.accept({id:'a'}),/site verilerinin/);
});
