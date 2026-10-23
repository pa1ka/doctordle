import test from 'node:test';
import assert from 'node:assert/strict';
import {progressFor,unseenCases} from '../game/progress.js';
const cases=['a','b','c','d'].map(id=>({id}));
const game=(caseId,status)=>({caseId,status,guesses:status==='playing'?[]:['answer']});
test('new case selection excludes daily, completed cases and previously opened practice',()=>{
 const s={records:{'2026-10-23':game('a','won')},practiceRecords:{b:game('b','lost')},visited:['c']};
 assert.deepEqual(unseenCases(cases,s).map(c=>c.id),['d']);
 assert.deepEqual(unseenCases(cases,s,['d']),[]);
});
test('failed daily is eligible for practice without altering daily history',()=>{
 const records={'2026-10-23':game('a','lost')};const saved=JSON.stringify(records);
 const s={records,practiceRecords:{a:game('a','playing')},repeatLog:[game('a','lost')]};
 assert.equal(progressFor('a',s).error,true);
 assert.equal(progressFor('a',s).seen,true);
 s.practiceRecords.a=game('a','won');
 assert.equal(progressFor('a',s).error,false);assert.equal(progressFor('a',s).solved,true);
 assert.equal(JSON.stringify(records),saved);
});
test('unfinished retry remains in errors after restoration and resumes its attempt',()=>{
 const retry={caseId:'a',status:'playing',guesses:['wrong']};
 const s=JSON.parse(JSON.stringify({practiceRecords:{a:retry},repeatLog:[game('a','lost')]}));
 assert.equal(progressFor('a',s).error,true);assert.equal(progressFor('a',s).inProgress,true);
 assert.deepEqual(progressFor('a',s).game,retry);
});
test('new case without history stays new and an empty default practice does not mask a daily failure',()=>{
 assert.equal(progressFor('d',{}).seen,false);
 const s={records:{'2026-10-23':game('a','lost')},practiceRecords:{a:game('a','playing')}};
 assert.equal(progressFor('a',s).game.status,'lost');assert.equal(progressFor('a',s).error,true);
});
