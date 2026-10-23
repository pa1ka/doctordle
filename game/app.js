import {compactClues} from './compact.js?v=14';
import { notesOf, EDITORIAL, visualFor } from './case-details.js?v=14';
import { CASES } from './data.js?v=14';
import { MAX_GUESSES, SKIP_GUESS, skipGuess, normalize, getDiagnosis, getCase, searchDiagnoses, resolveDiagnosis, dayKey, dayNumber, dailyCase, createGame, restoreGame, makeGuess, calculateStats, shareText } from './engine.js?v=14';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'doctordle-ru-v1';
let storageAvailable = true;
function readStore() {
  try { const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; }
  catch { storageAvailable = false; return {}; }
}
const stored = readStore();
let records = stored.records && typeof stored.records === 'object' && !Array.isArray(stored.records) ? stored.records : {};
let mode = 'daily';
let bookmarks = stored.bookmarks && typeof stored.bookmarks==='object' ? stored.bookmarks : {};
let repeatLog = Array.isArray(stored.repeatLog) ? stored.repeatLog : [];
let today = dayKey();
let daily = restoreGame(records[today], dailyCase(today).id, today);
let practiceIndex = CASES.some(item => item.id === stored.practice?.caseId) && Number.isSafeInteger(stored.practiceIndex) && stored.practiceIndex >= 0 ? stored.practiceIndex % (CASES.length * 1000) : 0;
let practice = restoreGame(stored.practice, CASES[practiceIndex % CASES.length].id);
let practiceRecords = stored.practiceRecords && typeof stored.practiceRecords === 'object' ? stored.practiceRecords : {};
if (stored.practice) practiceRecords[practice.caseId] = practice;
const linkedCase = new URLSearchParams(location.search).get('case');
const linkedIndex = CASES.findIndex(c => c.id === linkedCase);
if (linkedIndex >= 0) { mode = 'practice'; practiceIndex = linkedIndex; practice = restoreGame(practiceRecords[linkedCase], linkedCase); }
let theme = stored.theme === 'dark' ? 'dark' : 'light';
let selectedDiagnosis = null, suggestions = [], activeOption = -1, toastTimer;

const icons = {
  lock: '<svg class="clue-lock" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8V6a4 4 0 0 1 8 0v2M4 8h12v9H4zM10 11v3"/></svg>',
  check: '<svg class="clue-lock" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7"/></svg>'
};
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const current = () => mode === 'daily' ? daily : practice;
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, practiceIndex, practice, practiceRecords: {...practiceRecords, [practice.caseId]:practice}, bookmarks, repeatLog, theme })); }
  catch { if (storageAvailable) toast('Браузер не разрешил сохранить прогресс. Игра продолжит работать.'); storageAvailable = false; }
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}
function setTheme(next) {
  theme = next; document.documentElement.dataset.theme = theme;
  $('theme-button').setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  document.querySelector('meta[name=theme-color]').content = theme === 'dark' ? '#17191d' : '#f5f4ef';
}
function closeSuggestions() {
  $('suggestions').hidden = true; $('diagnosis-input').setAttribute('aria-expanded', 'false');
  $('diagnosis-input').removeAttribute('aria-activedescendant'); activeOption = -1;
}
function selectDiagnosis(item) {
  selectedDiagnosis = item; $('diagnosis-input').value = item.name; closeSuggestions();
  $('feedback').textContent = ''; $('diagnosis-input').focus();
}
function renderSuggestions() {
  const input = $('diagnosis-input');
  suggestions = searchDiagnoses(input.value);
  if (!input.value.trim()) { closeSuggestions(); return; }
  $('suggestions').replaceChildren();
  if (!suggestions.length) {
    const li = document.createElement('li'); li.className = 'no-results'; li.setAttribute('role', 'presentation');
    li.textContent = 'Не найдено. Попробуйте другое название или сокращение.'; $('suggestions').append(li);
  }
  suggestions.forEach((item, index) => {
    const li = document.createElement('li'); li.id = 'diagnosis-option-' + index; li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(index === activeOption)); li.textContent = item.name;
    const alias = item.aliases.find(a => normalize(a).includes(normalize(input.value)));
    if (alias && !normalize(item.name).includes(normalize(input.value))) {
      const small = document.createElement('small'); small.textContent = 'Также: ' + alias; li.append(small);
    }
    li.addEventListener('pointerdown', event => event.preventDefault());
    li.addEventListener('click', () => selectDiagnosis(item)); $('suggestions').append(li);
  });
  $('suggestions').hidden = false; input.setAttribute('aria-expanded', 'true');
}

function render() {
  const game = current(), caseData = getCase(game.caseId), done = game.status !== 'playing';
  $('daily-tab').classList.toggle('active', mode === 'daily'); $('practice-tab').classList.toggle('active', mode === 'practice');
  $('daily-tab').setAttribute('aria-pressed', String(mode === 'daily')); $('practice-tab').setAttribute('aria-pressed', String(mode === 'practice'));
  $('case-number').textContent = mode === 'daily' ? `СЛУЧАЙ №${String(Math.max(1, dayNumber(today))).padStart(3, '0')}` : `Случай ${practiceIndex % CASES.length + 1}`;
  $('case-date').textContent = mode === 'daily' ? new Date(today + 'T12:00:00+03:00').toLocaleDateString('ru-RU', { day:'numeric', month:'long' }) : '';
  $('case-date').dateTime = mode === 'daily' ? today : '';
  $('patient-meta').textContent = caseData.patient;
  $('archive-return').hidden = mode === 'daily';
  $('complaint').textContent = caseData.complaint;
  $('bookmark-button').textContent = bookmarks[caseData.id] ? '★ В закладках' : '☆ Сохранить';
  $('skip-button').hidden = done; $('skip-button').disabled = game.revealed>=5;
  $('clue-count').textContent = done ? `Использовано ${game.revealed} из 5` : `${game.revealed} / 5`;
  $('clues').innerHTML = caseData.clues.map((clue, i) => {
    const open = i < game.revealed || done;
    return `<li class="clue ${open ? 'open' : 'locked'}${done && i >= game.revealed ? ' revealed-after' : ''}" ${open ? '' : 'aria-label="Подсказка ' + (i + 1) + ' закрыта"'}><span class="clue-number" aria-hidden="true">0${i + 1}</span><span class="clue-text">${open ? escapeHTML(clue) + visualHTML(caseData,i) : 'Подсказка'}</span>${open ? icons.check : icons.lock}</li>`;
  }).join('');
  compactClues($('clues'));
  $('case-context').open = !done; $('case-context-label').hidden = !done;
  $('attempt-count').textContent = done ? `${game.guesses.length} / ${MAX_GUESSES} попыток` : `Попытка ${game.guesses.length + 1} / ${MAX_GUESSES}`;
  $('attempt-dots').innerHTML = Array.from({ length: MAX_GUESSES }, (_, i) => `<span class="attempt-dot ${i < game.guesses.length ? 'used' : i === game.guesses.length && !done ? 'current' : ''}"></span>`).join('');
  $('guess-form').hidden = done; $('input-hint').hidden = done;
  $('guess-history').innerHTML = game.guesses.map((id, i) => {
    if(id===SKIP_GUESS) return '<span class="guess-chip">↷ Подсказка</span>';
    const correct = id === caseData.diagnosis;
    return `<span class="guess-chip${correct ? ' correct' : ''}"><span aria-label="${correct ? 'Верно' : 'Неверно'}">${correct ? '✓' : '×'}</span>${escapeHTML(getDiagnosis(id).name)}</span>`;
  }).join('');
  $('game').classList.toggle('game-finished', done);
  $('result').hidden = !done;
  if (done) renderResult(game, caseData); else $('result').replaceChildren();
  $('next-daily').hidden = mode !== 'daily' || !done;
  updateClock();
}

function renderResult(game, caseData) {
  const won = game.status === 'won', result = $('result');
  result.className = 'result' + (won ? '' : ' lost');
  result.innerHTML = `<div class="result-eyebrow"><span>${won ? '✓ ДИАГНОЗ НАЙДЕН' : 'РАЗБОР СЛУЧАЯ'}</span><span>${won ? game.guesses.length : 'X'} / 6</span></div><h2>${escapeHTML(getDiagnosis(caseData.diagnosis).name)}</h2><p class="result-subtitle">${won ? (game.guesses.length === 1 ? 'Верный диагноз с первой попытки.' : `Вы справились за ${game.guesses.length} ${game.guesses.length < 5 ? 'попытки' : 'попыток'}.`) : 'Попытки закончились. Посмотрим, как складывалась картина.'}</p><p class="result-body">${escapeHTML(caseData.explanation)}</p><p class="takeaway">${escapeHTML(caseData.takeaway)}</p><a class="result-source" href="${caseData.source}" target="_blank" rel="noopener noreferrer">${escapeHTML(caseData.sourceLabel || 'MedlinePlus')} ↗</a><div class="result-grid" aria-label="${won ? 'Победа' : 'Ответ не найден'}">${game.guesses.map((_, i) => won && i === game.guesses.length - 1 ? '🟩' : '⬜').join('')}</div><div class="result-actions"><button id="share-button">Поделиться результатом ↗</button><button class="secondary" id="next-button">${mode === 'daily' ? 'Выбрать случай →' : 'Следующий пациент →'}</button></div>`;
  result.querySelector('h2').insertAdjacentHTML('afterend',`<div class="decisive"><h3>Решающие данные</h3><p>${escapeHTML(caseData.clues[4])}</p></div>`);
  const full=document.createElement('details');full.innerHTML='<summary>Подробное объяснение</summary>';result.querySelector('.result-body').before(full);full.append(result.querySelector('.result-body'),result.querySelector('.takeaway'));
  result.insertAdjacentHTML('beforeend', reviewHTML(game,caseData));
  if(mode==='practice'){const retry=document.createElement('button');retry.textContent='Пройти заново';retry.className='text-button';retry.addEventListener('click',()=>restartCase(caseData.id));result.append(retry);}
  const reasoning=result.querySelector('.reasoning');const more=document.createElement('details');more.className='extended-review';more.innerHTML='<summary>Гипотезы, источники и подробности</summary>';reasoning.before(more);more.append(reasoning);
  result.classList.add('result-card');
  const hero=document.createElement('div');hero.className='result-hero';
  const eyebrow=result.querySelector('.result-eyebrow');
  const title=result.querySelector('h2');
  const subtitle=result.querySelector('.result-subtitle');
  const grid=result.querySelector('.result-grid');
  grid.innerHTML=Array.from({length:MAX_GUESSES},(_,i)=>`<span class="result-step ${i<game.guesses.length?'used':''} ${won&&i===game.guesses.length-1?'correct':''}">${won&&i===game.guesses.length-1?'✓':i<game.guesses.length?'−':''}</span>`).join('');
  grid.setAttribute('aria-label',`${game.guesses.length} из ${MAX_GUESSES} попыток`);
  eyebrow.innerHTML=`<span class="outcome-mark">${won?'✓':'—'}</span><span>${won?'Верный диагноз':'Случай завершён'}</span>`;
  result.prepend(hero);hero.append(eyebrow,title,subtitle,grid);
  const actions=result.querySelector('.result-actions');actions.classList.add('primary-result-actions');
  const next=$('next-button');next.classList.remove('secondary');next.textContent=mode==='daily'?'Ещё один случай →':'Следующий случай →';
  $('share-button').classList.add('secondary');$('share-button').textContent='Поделиться';
  actions.prepend(next);hero.append(actions);
  const review=document.createElement('details');review.className='result-review';review.innerHTML='<summary>Разбор случая <span>＋</span></summary>';
  result.append(review);review.append(result.querySelector('.decisive'),result.querySelector('.result-body'),result.querySelector('.takeaway'),result.querySelector('.result-source'),reasoning);
  full.remove();more.remove();
  const extra=result.querySelector('.result-actions:not(.primary-result-actions)');
  if(extra){extra.className='result-quiet-actions';review.append(extra);}
  const retry=result.querySelector(':scope > .text-button');if(retry)review.append(retry);
  $('challenge-button').addEventListener('click', () => showChallenge(caseData));
  $('telegram-share').addEventListener('click', () => { const url = new URL('https://t.me/share/url'); url.searchParams.set('url', caseLink()); url.searchParams.set('text', shareText(current(),mode)); window.open(url.href,'_blank','noopener,noreferrer'); });
  $('share-button').addEventListener('click', shareResult);
  $('next-button').addEventListener('click', () => {
    if (mode === 'daily') { showArchive(); return; }
    else {
      practiceIndex = (practiceIndex + 1) % (CASES.length * 1000); practice = restoreGame(practiceRecords[CASES[practiceIndex % CASES.length].id], CASES[practiceIndex % CASES.length].id); persist(); resetInput(); render();
      if (practiceIndex % CASES.length === 0) toast(`Начался новый круг из ${CASES.length} клинических случаев.`);
    }
    $('game').scrollIntoView({ block:'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
}

function resetInput() {
  $('diagnosis-input').value = ''; selectedDiagnosis = null; closeSuggestions(); $('feedback').textContent = '';
}
function setMode(next) {
  if (mode === next) return;
  mode = next; if(next==='daily') history.replaceState(null,'',location.pathname); resetInput(); checkNewDay(); render();
}
function showFeedback(message) {
  $('feedback').textContent = message;
  $('answer-area').classList.remove('shake'); void $('answer-area').offsetWidth; $('answer-area').classList.add('shake');
}
function submitGuess(event,skip=false) {
  event.preventDefault();
  if (checkNewDay()) { toast('Начался новый день — открыт новый случай.'); return; }
  const diagnosis = skip ? {id:SKIP_GUESS} : selectedDiagnosis || resolveDiagnosis($('diagnosis-input').value);
  if (!diagnosis) {
    showFeedback($('diagnosis-input').value.trim() ? 'Выберите диагноз из списка. Попытка не потрачена.' : 'Сначала введите предполагаемый диагноз.');
    if ($('diagnosis-input').value.trim()) renderSuggestions();
    $('diagnosis-input').focus(); return;
  }
  const previous = current(), { game, error } = makeGuess(previous, diagnosis.id);
  if(error==='broader'){showFeedback('Верное направление. Уточните диагноз — попытка не потрачена.');return;}
  if(error==='no-clues'){showFeedback('Все подсказки открыты. Осталась попытка назвать диагноз.');return;}
  if (error === 'duplicate') { showFeedback('Этот диагноз вы уже проверяли. Попытка не потрачена.'); return; }
  if (error) return;
  if (mode === 'daily') { daily = game; records[today] = daily; } else { practice = game; practiceRecords[game.caseId] = game; }
  persist(); resetInput(); render();
  if (game.status === 'playing') {
    const lastClue = $('clues').children[game.revealed - 1]; lastClue?.classList.add('just-opened');
    $('feedback').textContent = `${skip ? 'Пропуск.' : 'Неверно.'} Открыта подсказка ${game.revealed}.`;
    $('diagnosis-input').focus();
  } else {
    $('result').setAttribute('tabindex', '-1'); $('result').focus({ preventScroll:true });
    $('result').scrollIntoView({ block:'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
}

function openModal(html) {
  closeSuggestions(); $('modal-body').innerHTML = html;
  if (!$('modal').open) $('modal').showModal();
}
function showHelp() {
  openModal(`<h2>Угадайте диагноз</h2><ol class="rules-list"><li>Прочитайте случай и введите предполагаемый диагноз.</li><li>Каждая ошибка открывает одну подсказку. Всего шесть попыток.</li><li>Другие случаи — в архиве.</li></ol><button class="modal-start" id="start-playing">Начать</button>`);
  $('start-playing').addEventListener('click', () => $('modal').close());
}
function showStats() {
  const stats = calculateStats(records, today), max = Math.max(1, ...stats.distribution);
  openModal(`<h2>Статистика</h2><div class="stat-grid"><div><strong>${stats.played}</strong><span>Сыграно</span></div><div><strong>${stats.rate}%</strong><span>Побед</span></div><div><strong>${stats.streak}</strong><span>Дней подряд</span></div><div><strong>${stats.wins}</strong><span>Решено</span></div></div><h3 class="distribution-title">Попытки</h3>${stats.distribution.map((value, i) => `<div class="distribution-row"><span>${i + 1}</span><div class="distribution-bar ${value ? 'has-wins' : ''}" style="--width:${Math.max(7, value / max * 94)}%">${value}</div></div>`).join('')}<p class="modal-footnote">Только случаи дня. Сохранено на этом устройстве.</p>`);
}
function showAbout() {
  openModal(`<h2>Докторли</h2><p>Ежедневная диагностическая головоломка для врачей, вдохновлённая <a href="https://doctordle.org/" target="_blank" rel="noopener noreferrer">Doctordle</a>.</p><p>Сейчас доступно <strong>${CASES.length} случаев повышенной сложности</strong>. Подсказки ведут от жалоб к анамнезу, лабораторным и инструментальным данным. Новый случай — в 00:00 МСК; тренировочный набор можно проходить без ожидания.</p><p>В архиве есть учебные истории и адаптации опубликованных наблюдений. Происхождение, авторы и источники указаны в разборе каждого случая. Независимая клиническая редактура ещё не проводилась.</p><p>Это учебная игра с заданным ответом. На ранних этапах возможны несколько обоснованных гипотез.</p>`);
}
async function shareResult() {
  const text = shareText(current(), mode) + '\n' + caseLink();
  try { await navigator.clipboard.writeText(text); toast('Результат скопирован. Диагноз остался в секрете.'); }
  catch {
    openModal('<h2>Результат без спойлеров</h2><p>Скопируйте и отправьте друзьям.</p><textarea class="share-copy" id="share-copy" readonly aria-label="Результат для копирования"></textarea><button class="modal-start" id="select-result">Выделить результат</button>');
    $('share-copy').value = text; $('select-result').addEventListener('click', () => { $('share-copy').focus(); $('share-copy').select(); });
  }
}
function checkNewDay() {
  const next = dayKey();
  if (next === today) return false;
  today = next; daily = restoreGame(records[today], dailyCase(today).id, today);
  if (mode === 'daily') { resetInput(); render(); }
  return mode === 'daily';
}
function updateClock() {
  if (mode === 'practice') return;
  const next = Date.parse(today + 'T00:00:00+03:00') + 86400000;
  const seconds = Math.max(0, Math.floor((next - Date.now()) / 1000));
  $('countdown').textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}

$('guess-form').addEventListener('submit', submitGuess);
$('daily-tab').addEventListener('click', () => setMode('daily'));
$('practice-tab').addEventListener('click', showArchive);
$('archive-return').addEventListener('click', showArchive);
$('stats-button').addEventListener('click', showStats);
$('help-button').addEventListener('click', showHelp);
$('about-button').addEventListener('click', showAbout);
$('bookmark-button').addEventListener('click',showBookmark);
$('skip-button').addEventListener('click',e=>submitGuess(e,true));
$('close-modal').addEventListener('click', () => $('modal').close());
$('modal').addEventListener('click', event => { if (event.target === $('modal')) { const rect = $('modal').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('modal').close(); } });
$('theme-button').addEventListener('click', () => { setTheme(theme === 'dark' ? 'light' : 'dark'); persist(); });
$('diagnosis-input').addEventListener('input', () => { selectedDiagnosis = null; activeOption = -1; $('feedback').textContent = ''; renderSuggestions(); });
$('diagnosis-input').addEventListener('focus', () => { if ($('diagnosis-input').value && !selectedDiagnosis) renderSuggestions(); });
$('diagnosis-input').addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeSuggestions(); return; }
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
    event.preventDefault();
    activeOption = (activeOption + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    renderSuggestions(); const li = $('diagnosis-option-' + activeOption); li?.scrollIntoView({ block:'nearest' });
    if (li) $('diagnosis-input').setAttribute('aria-activedescendant', li.id);
  }
  if (event.key === 'Enter' && !$('suggestions').hidden && activeOption >= 0 && suggestions[activeOption]) { event.preventDefault(); selectDiagnosis(suggestions[activeOption]); }
});
document.addEventListener('pointerdown', event => { if (!event.target.closest('.search-wrap')) closeSuggestions(); });
window.addEventListener('focus', () => { checkNewDay(); updateClock(); });
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const next = JSON.parse(event.newValue);
    if (next.records && typeof next.records === 'object' && !Array.isArray(next.records)) {
      records = next.records; daily = restoreGame(records[today], dailyCase(today).id, today); resetInput(); render();
    }
  } catch { /* Ignore an invalid update from another tab. */ }
});
setTheme(theme); render();
setInterval(() => { checkNewDay(); updateClock(); }, 1000);
if (!storageAvailable) toast('Сохранение недоступно в этом браузере. Игра работает до закрытия страницы.');

function caseLink(){const u=new URL(location.origin);u.searchParams.set('case',current().caseId);return u.href;}
function visualHTML(c,i){
 const v=visualFor(c,i);if(!v)return '';
 if(v.rows)return `<span class="clinical-visual"><strong>${escapeHTML(v.title)}</strong><span class="measurement-grid">${v.rows.map(([a,b])=>`<span>${escapeHTML(a)}</span><b>${escapeHTML(b)}</b>`).join('')}</span><small>${escapeHTML(v.caption)}</small></span>`;
 return `<span class="clinical-visual"><strong>${escapeHTML(v.title)}</strong><svg viewBox="0 0 300 130" role="img" aria-label="Амплитуды М-ответа: ${v.values.join(', ')} ${v.unit}. Декремент 18 процентов.">${v.values.map((n,j)=>`<rect x="${18+j*56}" y="${105-n*7}" width="24" height="${n*7}" fill="currentColor" stroke="none"/><text x="${30+j*56}" y="${97-n*7}" text-anchor="middle" fill="currentColor" stroke="none" font-size="11">${n}</text><text x="${30+j*56}" y="123" text-anchor="middle" fill="currentColor" stroke="none" font-size="10">${j+1}</text>`).join('')}</svg><small>${escapeHTML(v.caption)}</small></span>`;
}
function reviewHTML(game,c){
 const notes=notesOf(c), wrong=game.guesses.filter(id=>id!==c.diagnosis&&id!==SKIP_GUESS);
 const attempted=wrong.map(id=>`<div class="differential"><h4>${escapeHTML(getDiagnosis(id).name)}</h4><p>${escapeHTML(notes[id] || 'Отдельного разбора этой версии пока нет.')}</p></div>`).join('');
 const alternatives=Object.entries(notes).filter(([id])=>!wrong.includes(id)).map(([id,n])=>`<div class="differential"><h4>${escapeHTML(getDiagnosis(id)?.name||id)}</h4><p>${escapeHTML(n)}</p></div>`).join('');
 return `<div class="result-actions"><button id="telegram-share">В Telegram ↗</button><button id="challenge-button" class="secondary">Оспорить ответ</button></div><div class="reasoning"><details><summary>Разобрать случай по шагам</summary><ol>${c.clues.map((x,i)=>`<li><span>0${i+1}</span><p>${escapeHTML(x)}</p></li>`).join('')}</ol></details>${wrong.length?`<h3>Ваши гипотезы</h3>${attempted}`:''}${alternatives?`<details><summary>С чем ещё сравнить</summary>${alternatives}</details>`:''}<details class="editorial"><summary>Источники</summary><p>${c.publication ? 'Адаптировано из опубликованного клинического наблюдения. '+escapeHTML(c.publication.title||'') : 'История пациента вымышленная; заболевание и диагностические признаки основаны на медицинских источниках.'}</p><p>Независимая врачебная проверка пока не проведена.</p><a href="${c.source}" target="_blank" rel="noopener noreferrer">${escapeHTML(c.sourceLabel)} ↗</a>${c.publication?`<p>${escapeHTML(c.publication.authors || c.publication.author || '')} · ${escapeHTML(c.publication.year)}<br>${escapeHTML(c.publication.adaptation || 'Сокращённый перевод и адаптация в игровую задачу.')}</p><a href="${c.publication.licenseUrl}" target="_blank" rel="noopener noreferrer">${escapeHTML(c.publication.license)} ↗</a>`:''}</details></div>`;
}
let archiveStatus='Все';
function showArchive(){
 openModal(`<h2>Архив</h2><div class="archive-filters"><label>Прогресс<select id="status-filter">${['Все','Не начаты','В процессе','Завершены','Мои ошибки','Закладки','Реальные случаи'].map(x=>`<option${x===archiveStatus?' selected':''}>${x}</option>`).join('')}</select></label></div><div id="archive-list"></div><button class="modal-start" id="random-case">Случайный случай</button><button class="text-button" id="my-reports">Мои замечания</button>`);
 $('status-filter').addEventListener('change',e=>{archiveStatus=e.target.value;renderArchive();});
 $('random-case').addEventListener('click',()=>{const pool=archivePool();if(pool.length)openCase(pool[Math.floor(Math.random()*pool.length)].id);});
 $('my-reports').addEventListener('click',showReports);renderArchive();
}
function archiveGame(c){let saved=c.id===practice.caseId?practice:practiceRecords[c.id];if(!saved?.guesses?.length&&!Object.hasOwn(practiceRecords,c.id)){const dailyHistory=Object.values(records).filter(g=>g?.caseId===c.id&&g.guesses?.length);if(dailyHistory.length)saved={...dailyHistory.at(-1),day:null};}return restoreGame(saved,c.id);}
function archivePool(){return CASES.filter(c=>{const g=archiveGame(c);return (archiveStatus==='Все'||archiveStatus==='Мои ошибки'&&g.status==='lost'||archiveStatus==='Закладки'&&!!bookmarks[c.id]||archiveStatus==='Реальные случаи'&&!!c.publication||archiveStatus==='Не начаты'&&!g.guesses.length||archiveStatus==='В процессе'&&g.status==='playing'&&g.guesses.length>0||archiveStatus==='Завершены'&&g.status!=='playing');});}
function renderArchive(){
 const pool=archivePool();$('random-case').disabled=!pool.length;
 $('archive-list').innerHTML=pool.length?pool.map(c=>{const g=archiveGame(c),done=g.status!=='playing';return `<button class="archive-case" data-case="${c.id}"><span class="archive-id">${c.id.slice(-2)}</span><span><strong>${escapeHTML(done?getDiagnosis(c.diagnosis).name:c.patient)}</strong><small>${c.publication?'Реальный случай · ':''}${done?(g.status==='won'?'Решён':'Не решён'):g.guesses.length?'Продолжить · '+g.guesses.length+'/6':'Не начат'}</small></span><span aria-hidden="true">${done?'✓':'↗'}</span></button>`;}).join(''):'<p>Нет случаев с такими фильтрами.</p>';
 $('archive-list').querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>openCase(b.dataset.case)));
}
function openCase(id){
 const selectedSaved=archiveGame(getCase(id));
 practiceRecords[practice.caseId]=practice;practiceIndex=CASES.findIndex(c=>c.id===id);if(practiceIndex<0)return;
 practice=selectedSaved;mode='practice';resetInput();persist();render();$('modal').close();
 history.replaceState(null,'',`?case=${encodeURIComponent(id)}`);$('game').scrollIntoView({block:'start'});
}
function readReports(){try{const r=JSON.parse(localStorage.getItem('doctordle-reports')||'[]');return Array.isArray(r)?r:[];}catch{return [];}}
function showChallenge(c){
 openModal(`<h2>Оспорить ответ</h2><p>${escapeHTML(getDiagnosis(c.diagnosis).name)}</p><form id="challenge-form"><label class="field-label">Ваш диагноз<input id="challenge-diagnosis" required maxlength="160"></label><label class="field-label">Какие данные поддерживают вашу версию?<textarea id="challenge-reason" required minlength="20" maxlength="3000" rows="5"></textarea></label><label class="field-label">Источник, если есть<input id="challenge-source" type="url" maxlength="500" placeholder="https://…"></label><p class="report-notice">Сохранится на этом устройстве, без отправки. Не указывайте данные пациентов.</p><button class="modal-start" type="submit">Сохранить замечание</button><p id="report-error" role="alert"></p></form>`);
 $('challenge-form').addEventListener('submit',e=>{e.preventDefault();const diagnosis=$('challenge-diagnosis').value.trim(),reason=$('challenge-reason').value.trim();if(!diagnosis||reason.length<20){$('report-error').textContent='Укажите диагноз и обоснование длиной от 20 символов.';return;}const report={id:typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join(''),caseId:c.id,caseVersion:EDITORIAL.version,diagnosis,reason,source:$('challenge-source').value.trim(),createdAt:new Date().toISOString(),status:'Локальный черновик — не отправлен'};try{localStorage.setItem('doctordle-reports',JSON.stringify([...readReports(),report]));showReports();}catch{$('report-error').textContent='Браузер не разрешил сохранить. Скопируйте текст перед закрытием.';}});
}
function showReports(){
 const reports=readReports();openModal(`<h2>Мои замечания</h2><p>Черновики, не отправлены.</p>${reports.length?reports.map(r=>`<article class="report-card"><small>${escapeHTML(r.caseId)} · ${escapeHTML(r.status)}</small><h3>${escapeHTML(r.diagnosis)}</h3><p>${escapeHTML(r.reason)}</p></article>`).join(''):'<p>Сохранённых замечаний пока нет.</p>'}${reports.length?'<button id="export-reports" class="modal-start">Скачать замечания (.json)</button>':''}`);
 if(reports.length)$('export-reports').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(reports,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='doctordle-review-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
}

function showBookmark(){
 const c=getCase(current().caseId), old=bookmarks[c.id];
 openModal(`<h2>Личная заметка</h2><p>${escapeHTML(c.patient)}</p><label class="field-label">Что запомнить<textarea id="bookmark-note" maxlength="2000" rows="5"></textarea></label><button id="save-bookmark" class="modal-start">Сохранить в закладки</button>${old?'<button id="remove-bookmark" class="text-button">Убрать из закладок</button>':''}`);
 $('bookmark-note').value=old?.note||'';
 $('save-bookmark').addEventListener('click',()=>{bookmarks[c.id]={note:$('bookmark-note').value.trim(),updatedAt:new Date().toISOString()};persist();render();$('modal').close();toast('Сохранено');});
 if(old)$('remove-bookmark').addEventListener('click',()=>{delete bookmarks[c.id];persist();render();$('modal').close();});
}
function restartCase(id){
 const previous=archiveGame(getCase(id));repeatLog.push({...previous,repeatedAt:new Date().toISOString()});repeatLog=repeatLog.slice(-100);practiceRecords[id]=createGame(id);if(practice.caseId===id)practice=practiceRecords[id];openCase(id);
}
