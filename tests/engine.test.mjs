import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, LEGACY_CASES, DIAGNOSES } from '../game/data.js';
import { createGame, makeGuess, skipGuess, SKIP_GUESS, restoreGame, getDiagnosis, resolveDiagnosis, searchDiagnoses, dayKey, dailyCase, calculateStats, shareText } from '../game/engine.js';

const caseData = CASES[0];
const wrongIds = DIAGNOSES.filter(d => d.id !== caseData.diagnosis).slice(0, 6).map(d => d.id);

test('all five clues start closed; each wrong guess opens exactly one, with a final guess after clue five', () => {
  let game = createGame(caseData.id);
  assert.equal(game.revealed, 0);
  wrongIds.slice(0, 5).forEach((id, i) => {
    game = makeGuess(game, id).game;
    assert.equal(game.revealed, i + 1);
    assert.equal(game.status, 'playing');
  });
  game = makeGuess(game, caseData.diagnosis).game;
  assert.equal(game.status, 'won'); assert.equal(game.guesses.length, 6);
});

test('sixth wrong answer ends game and no later answers are accepted', () => {
  let game = createGame(caseData.id);
  wrongIds.forEach(id => { game = makeGuess(game, id).game; });
  assert.equal(game.status, 'lost'); assert.equal(game.revealed, 5);
  assert.equal(makeGuess(game, caseData.diagnosis).error, 'finished');
});

test('correct first guess wins without using any clues', () => {
  const game = makeGuess(createGame(caseData.id), caseData.diagnosis).game;
  assert.equal(game.status, 'won'); assert.equal(game.revealed, 0);
});

test('duplicate and unknown answers do not spend attempts or open clues', () => {
  const game = makeGuess(createGame(caseData.id), wrongIds[0]).game;
  assert.equal(makeGuess(game, wrongIds[0]).error, 'duplicate');
  assert.equal(makeGuess(game, 'not-a-diagnosis').error, 'unknown');
  assert.equal(game.guesses.length, 1); assert.equal(game.revealed, 1);
});

test('synonyms, ё, case and minor typo searches resolve sensibly without automatic fuzzy submission', () => {
  assert.equal(resolveDiagnosis('  ВЕТРЯНКА  ').id, 'varicella');
  assert.equal(resolveDiagnosis('ГЭРБ').id, 'gerd');
  assert.equal(resolveDiagnosis('воспаление лёгких').id, 'pneumonia');
  assert.equal(searchDiagnoses('мигрен')[0].id, 'migraine');
  assert.equal(resolveDiagnosis('мигрен'), null);
});

test('reload replays valid progress and rejects falsified status, duplicate answers, or a different case', () => {
  const data = { caseId: caseData.id, day: null, guesses: wrongIds.slice(0, 2), status: 'won', revealed: 5 };
  const game = restoreGame(data, caseData.id);
  assert.equal(game.status, 'playing'); assert.equal(game.revealed, 2);
  assert.equal(restoreGame(data, CASES[1].id).guesses.length, 0);
  assert.equal(restoreGame({ ...data, guesses: [wrongIds[0], wrongIds[0]] }, caseData.id).guesses.length, 1);
});

test('Moscow daily rollover is deterministic at 21:00 UTC', () => {
  assert.equal(dayKey(new Date('2026-10-22T20:59:59Z')), '2026-10-22');
  assert.equal(dayKey(new Date('2026-10-22T21:00:00Z')), '2026-10-23');
  assert.equal(dailyCase('2026-10-22').id, LEGACY_CASES[0].id);
  assert.equal(dailyCase('2026-10-23').id, CASES[0].id);
  assert.notEqual(dailyCase('2026-10-24').id, dailyCase('2026-10-23').id);
});

test('daily stats count completed games once and streak survives an unfinished new day', () => {
  const day = '2026-10-23', win = makeGuess(createGame(dailyCase(day).id, day), dailyCase(day).diagnosis).game;
  const records = { [day]: win, '2026-10-24': createGame(dailyCase('2026-10-24').id, '2026-10-24') };
  const stats = calculateStats(records, '2026-10-24');
  assert.equal(stats.wins, 1); assert.equal(stats.played, 1); assert.equal(stats.streak, 1);
  assert.equal(calculateStats(records, '2026-10-25').streak, 0);
});

test('sharing never includes the answer or clue text', () => {
  const game = makeGuess(createGame(caseData.id, '2026-10-23'), caseData.diagnosis).game;
  const text = shareText(game, 'daily');
  assert.match(text, /1\/6/); assert.ok(!text.includes(getDiagnosis(caseData.diagnosis).name));
  caseData.clues.forEach(clue => assert.ok(!text.includes(clue)));
});

test('every current case has five clues, a canonical answer, and a primary source URL', () => {
  for (const item of CASES) {
    assert.equal(item.clues.length, 5); assert.ok(DIAGNOSES.some(d => d.id === item.diagnosis));
    assert.match(item.source, /^https:\/\/(www\.)?(niams\.nih\.gov|cdc\.gov|endocrine\.org|escardio\.org|pmc\.ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|niddk\.nih\.gov|publications\.ersnet\.org|ncbi\.nlm\.nih\.gov|ninds\.nih\.gov|imagebank\.hematology\.org|kdigo\.org|endocrinepractice\.org|frontiersin\.org|academic\.oup\.com|amjcaserep\.com)\//);
  }
});


test('previous daily wins remain valid after the harder case set is introduced', () => {
  const oldCase = LEGACY_CASES[0];
  const win = makeGuess(createGame(oldCase.id, '2026-10-22'), oldCase.diagnosis).game;
  const stats = calculateStats({ '2026-10-22': win }, '2026-10-23');
  assert.equal(stats.wins, 1); assert.equal(stats.streak, 1);
});

test('expert answers and their clinical synonyms are accepted without merging distinct diagnoses', () => {
  assert.equal(resolveDiagnosis('Болезнь Рейно').id, 'raynaud');
  assert.equal(resolveDiagnosis('синдром Рейно').id, 'secondary-raynaud');
  assert.equal(resolveDiagnosis('аддисонический криз').id, 'adrenal-crisis');
  assert.equal(resolveDiagnosis('аортальный стеноз').id, 'aortic-stenosis');
  assert.equal(resolveDiagnosis('ТТП').id, 'ttp');
  assert.equal(resolveDiagnosis('Описторхоз').id, 'opisthorchis');
});

test('expanding archive preserves original scheduled days and all answers resolve',()=>{
 assert.ok(CASES.length >= 20);
 for(let i=0;i<10;i++) assert.equal(dailyCase(`2026-${i<9?'10-'+String(23+i):'11-01'}`).id,CASES[i].id);
 for(const c of CASES) assert.equal(makeGuess(createGame(c.id),c.diagnosis).game.status,'won');
 assert.equal(new Set(DIAGNOSES.map(d=>d.id)).size,DIAGNOSES.length);
});


test('skips spend attempts, may repeat, and leave a sixth diagnosis attempt', () => {
  let game = createGame(caseData.id);
  for (let i = 1; i <= 5; i++) {
    const before = game;
    game = skipGuess(game).game;
    assert.equal(game.guesses.length, i);
    assert.equal(game.revealed, i);
    assert.equal(game.status, 'playing');
    assert.equal(before.guesses.length, i - 1);
  }
  assert.deepEqual(game.guesses, Array(5).fill(SKIP_GUESS));
  assert.deepEqual(game.guessesConfidence, Array(5).fill(null));
  const blocked = skipGuess(game);
  assert.equal(blocked.error, 'no-clues');
  assert.equal(blocked.game, game);
  const won = makeGuess(game, caseData.diagnosis, 'confident').game;
  assert.equal(won.status, 'won');
  assert.equal(won.guesses.length, 6);
  assert.equal(skipGuess(won).error, 'finished');
});

test('mixed skips and diagnoses replay confidence without trusting invalid values', () => {
  let game = makeGuess(createGame(caseData.id), wrongIds[0], 'confident').game;
  game = skipGuess(game).game;
  game = skipGuess(game).game;
  game = makeGuess(game, wrongIds[1], 'invalid').game;
  game = makeGuess(game, caseData.diagnosis, 'hypothesis').game;
  assert.deepEqual(game.guessesConfidence, ['confident', null, null, 'hypothesis', 'hypothesis']);
  assert.deepEqual(restoreGame(game, caseData.id), game);
  const legacy = {...game}; delete legacy.guessesConfidence;
  assert.deepEqual(restoreGame(legacy, caseData.id).guessesConfidence, ['hypothesis', null, null, 'hypothesis', 'hypothesis']);
  assert.equal(makeGuess(makeGuess(createGame(caseData.id), wrongIds[0]).game, wrongIds[0]).error, 'duplicate');
});

test('too-broad known answers request refinement without spending a guess', () => {
  for (const [caseId, diagnosisId] of [['expert-03','addison'],['expert-12','infective-endocarditis']]) {
    const initial = createGame(caseId);
    const result = makeGuess(initial, diagnosisId, 'confident');
    assert.equal(result.error, 'broader');
    assert.equal(result.game, initial);
    assert.equal(result.game.guesses.length, 0);
    assert.equal(result.game.revealed, 0);
  }
  assert.equal(makeGuess(createGame('expert-03'), resolveDiagnosis('аддисонический криз').id).game.status, 'won');
});

test('published archive additions cannot reshuffle the twenty-case daily rotation', () => {
  assert.equal(dailyCase('2026-11-02').id, CASES[10].id);
  assert.equal(dailyCase('2026-11-11').id, CASES[19].id);
  assert.equal(dailyCase('2026-11-12').id, CASES[0].id);
});


test('legacy broader answers retain their consumed attempts across repeated restoration', () => {
  for (const [caseId, broadId, answer] of [['expert-03','addison','adrenal-crisis'],['expert-12','infective-endocarditis','q-fever']]) {
    const historical = {caseId, day:null, guesses:[broadId, answer], status:'won', revealed:1};
    const restored = restoreGame(historical, caseId);
    assert.equal(restored.status, 'won');
    assert.equal(restored.revealed, 1);
    assert.deepEqual(restored.guesses, [broadId, answer]);
    assert.deepEqual(restored.guessesConfidence, ['hypothesis', 'hypothesis']);
    assert.deepEqual(restoreGame(restored, caseId), restored);
    assert.equal(makeGuess(createGame(caseId), broadId).error, 'broader');
    const duplicate = restoreGame({...historical, guesses:[broadId,broadId,answer]},caseId);
    assert.deepEqual(duplicate.guesses,[broadId]);
  }
});
