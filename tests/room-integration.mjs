import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const base=process.env.ROOM_TEST_URL;if(!base)throw Error('Set ROOM_TEST_URL to local preview');
const a=randomBytes(32).toString('hex'),b=randomBytes(32).toString('hex'),c=randomBytes(32).toString('hex');
async function call(path,key,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
const created=await call('/api/rooms',a,{name:'QA A',caseId:'expert-01'});assert.equal(created.status,200,JSON.stringify(created));const id=created.data.id;
assert.equal((await call('/api/room',b,{id,name:'QA B'})).status,200);
assert.equal((await call('/api/room-action?action=start',b,{id})).status,403);
assert.equal((await call('/api/room-action?action=start',a,{id})).status,200);
assert.equal((await call('/api/room',c,{id,name:'QA C'})).status,409);
let r=await call('/api/room-action?action=guess',a,{id,diagnosis:'raynaud',confidence:'confident',turn:0});assert.equal(r.status,200);assert.equal(r.data.completed,false);assert.equal(r.data.members[0].game,undefined);assert.equal(r.data.answer,undefined);
r=await call('/api/room?id='+id,b);assert.equal(r.data.members[0].game,undefined);
r=await call('/api/room-action?action=guess',b,{id,diagnosis:'__skip__',turn:0});assert.equal(r.data.game.revealed,1);
r=await call('/api/room-action?action=guess',b,{id,diagnosis:'raynaud',turn:0});assert.equal(r.status,409);
r=await call('/api/room-action?action=guess',b,{id,diagnosis:'raynaud',turn:1});assert.equal(r.data.completed,true);assert.equal(r.data.members.length,2);assert.equal(r.data.members[0].game.guesses[0],'raynaud');assert.equal(r.data.answer,'raynaud');
console.log('Room integration passed: two players, host control, join lock, hidden answers, replay prevention, final comparison.');
