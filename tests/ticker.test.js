import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeAge} from '../src/ticker.js';
const now=Date.parse('2026-09-13T12:00:00Z');
test('ticker ages use real timestamps and never fabricate missing times',()=>{
 assert.equal(relativeAge(null,now),'Zaman bilinmiyor');
 assert.equal(relativeAge('invalid',now),'Zaman bilinmiyor');
 assert.equal(relativeAge('2026-09-13T11:59:45Z',now),'Az önce');
 assert.equal(relativeAge('2026-09-13T11:55:00Z',now),'5 dakika önce');
 assert.equal(relativeAge('2026-09-13T10:00:00Z',now),'2 saat önce');
 assert.equal(relativeAge('2026-09-11T12:00:00Z',now),'2 gün önce');
 assert.equal(relativeAge('2026-09-13T12:01:00Z',now),'Az önce');
});
