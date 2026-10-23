import { CASES, LEGACY_CASES, DIAGNOSES } from './data.js?v=14';

export const MAX_GUESSES = 6;
export const SKIP_GUESS = '__skip__';
export const normalize = value => String(value).toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const getDiagnosis = id => DIAGNOSES.find(item => item.id === id);
export const getCase = id => CASES.find(item => item.id === id) || LEGACY_CASES.find(item => item.id === id);

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

export function searchDiagnoses(query) {
  const q = normalize(query);
  if (!q) return [];
  return DIAGNOSES.map(item => {
    const forms = [item.name, ...item.aliases].map(normalize);
    let score = forms.some(f => f === q) ? 0 : forms.some(f => f.startsWith(q)) ? 1 : forms.some(f => f.includes(q)) ? 2 : 99;
    if (score === 99 && q.length >= 4 && forms.some(f => distance(f, q) <= (q.length >= 8 ? 2 : 1))) score = 3;
    return { ...item, score };
  }).filter(item => item.score < 99).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'ru')).slice(0, 7);
}

export function resolveDiagnosis(query) {
  const q = normalize(query);
  return DIAGNOSES.find(item => [item.name, ...item.aliases].some(form => normalize(form) === q)) || null;
}

export function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function dayNumber(day) {
  return Math.floor((Date.parse(day + 'T00:00:00Z') - Date.parse('2026-10-22T00:00:00Z')) / 86400000) + 1;
}

export function dailyCase(day = dayKey()) {
  const legacy = day < '2026-10-23';
  const pool = legacy ? LEGACY_CASES : day < '2026-11-02' ? CASES.slice(0,10) : CASES.slice(0,20);
  const offset = legacy ? dayNumber(day) - 1 : dayNumber(day) - 2;
  return pool[((offset % pool.length) + pool.length) % pool.length];
}

export function createGame(caseId, day = null) {
  if (!getCase(caseId)) throw new Error('Unknown case');
  return { caseId, day, guesses: [], guessesConfidence: [], status: 'playing', revealed: 0 };
}

const BROAD_ANSWERS = {
  'expert-03': new Set(['addison']),
  'expert-12': new Set(['infective-endocarditis'])
};
const cleanConfidence = value => value === 'confident' ? 'confident' : 'hypothesis';
const previousConfidence = game => game.guesses.map((id, index) => id === SKIP_GUESS ? null : cleanConfidence(game.guessesConfidence?.[index]));

export function skipGuess(game) {
  if (game.status !== 'playing') return { game, error: 'finished' };
  if (game.revealed >= 5 || game.guesses.length >= MAX_GUESSES - 1) return { game, error: 'no-clues' };
  return { game: { ...game, guesses: [...game.guesses, SKIP_GUESS], guessesConfidence: [...previousConfidence(game), null], revealed: game.revealed + 1 }, error: null };
}

export function makeGuess(game, diagnosisId, confidence = 'hypothesis') {
  if (diagnosisId === SKIP_GUESS) return skipGuess(game);
  if (game.status !== 'playing') return { game, error: 'finished' };
  if (!getDiagnosis(diagnosisId)) return { game, error: 'unknown' };
  if (game.guesses.includes(diagnosisId)) return { game, error: 'duplicate' };
  if (BROAD_ANSWERS[game.caseId]?.has(diagnosisId)) return { game, error: 'broader' };
  const won = getCase(game.caseId).diagnosis === diagnosisId;
  const guesses = [...game.guesses, diagnosisId];
  const guessesConfidence = [...previousConfidence(game), cleanConfidence(confidence)];
  return { game: { ...game, guesses, guessesConfidence, revealed: won ? game.revealed : Math.min(guesses.length, 5), status: won ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing' }, error: null };
}

export function restoreGame(value, caseId, day = null) {
  let game = createGame(caseId, day);
  if (!value || value.caseId !== caseId || value.day !== day || !Array.isArray(value.guesses)) return game;
  // Replay persisted answers: never trust a stored win or clue count.
  for (const [index, id] of value.guesses.slice(0, MAX_GUESSES).entries()) {
    const result = makeGuess(game, id, value.guessesConfidence?.[index]);
    if (result.error === 'broader') {
      // Before refinement prompts existed, these answers consumed an attempt.
      // Keep already-recorded history (including after subsequent saves), but
      // never let a new makeGuess call spend a guess on the broader answer.
      const guesses = [...game.guesses, id];
      game = { ...game, guesses,
        guessesConfidence: [...previousConfidence(game), cleanConfidence(value.guessesConfidence?.[index])],
        revealed: Math.min(guesses.length, 5),
        status: guesses.length >= MAX_GUESSES ? 'lost' : 'playing' };
      continue;
    }
    if (result.error) break;
    game = result.game;
  }
  return game;
}

export function calculateStats(records, today = dayKey()) {
  const entries = Object.entries(records || {}).filter(([day, game]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today && game && getCase(game.caseId) && dailyCase(day).id === game.caseId)
    .map(([day, game]) => [day, restoreGame(game, game.caseId, day)]).filter(([, game]) => game.status !== 'playing');
  const wins = entries.filter(([, game]) => game.status === 'won');
  const wonDays = new Set(wins.map(([day]) => day));
  const previousDay = day => new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  let cursor = wonDays.has(today) ? today : previousDay(today), streak = 0;
  while (wonDays.has(cursor)) { streak++; cursor = previousDay(cursor); }
  const distribution = Array(6).fill(0);
  wins.forEach(([, game]) => distribution[game.guesses.length - 1]++);
  return { played: entries.length, wins: wins.length, rate: entries.length ? Math.round(wins.length / entries.length * 100) : 0, streak, distribution };
}

export function shareText(game, mode) {
  const title = mode === 'daily' ? `Диагноз дня №${Math.max(1, dayNumber(game.day))}` : 'Тренировка';
  const grid = game.guesses.map((_, index) => game.status === 'won' && index === game.guesses.length - 1 ? '🟩' : '⬜').join('');
  return `Докторли · ${title}\n${game.status === 'won' ? game.guesses.length : 'X'}/6 ${grid}\nБез спойлеров. Попробуешь?`;
}
