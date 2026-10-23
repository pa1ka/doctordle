import {progressFor, unseenCases} from './progress.js?v=15';
import {compactClues} from './compact.js?v=15';
import { notesOf, EDITORIAL, visualFor } from './case-details.js?v=15';
import { CASES } from './data.js?v=15';
import { MAX_GUESSES, SKIP_GUESS, skipGuess, normalize, getDiagnosis, getCase, searchDiagnoses, resolveDiagnosis, dayKey, dayNumber, dailyCase, createGame, restoreGame, makeGuess, calculateStats, shareText } from './engine.js?v=15';

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
let visited = Array.isArray(stored.visited) ? stored.visited : [];
let tipDismissed = stored.tipDismissed === true;
let archiveStatus='Новые', archivePage=0;
let theme = stored.theme === 'dark' ? 'dark' : 'light';
let selectedDiagnosis = null, suggestions = [], activeOption = -1, toastTimer;

const icons = {
  lock: '<svg class="clue-lock" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8V6a4 4 0 0 1 8 0v2M4 8h12v9H4zM10 11v3"/></svg>',
  check: '<svg class="clue-lock" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10 3 3 7-7"/></svg>'
};
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const current = () => mode === 'daily' ? daily : practice;
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, practiceIndex, practice, practiceRecords: {...practiceRecords, [practice.caseId]:practice}, bookmarks, repeatLog, visited, tipDismissed, theme })); }
  catch { if (storageAvailable) toast('Браузер не разрешил сохранить прогресс. Игра продолжит работать.'); storageAvailable = false; }
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}
function setTheme(next) {
  theme = next; document.documentElement.dataset.theme = theme;
  $('theme-button').textContent = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
  $('theme-button').setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
  document.querySelector('meta[name=theme-color]').content = theme === 'dark' ? '#17191d' : '#f5f4ef';
}
function closeSuggestions() {
  $('suggestions').hidden = true; $('diagnosis-input').setAttribute('aria-expanded', 'false');
  $('diagnosis-input').removeAttribute('aria-activedescendant'); activeOption = -1;
}
function selectDiagnosis(item) {
  selectedDiagnosis = item; $('diagnosis-input').value = item.name; closeSuggestions();
  $('feedback').textContent = ''; $('diagnosis-input').focus({preventScroll:true}); $('submit-button').scrollIntoView({block:'nearest'});
}
function renderSuggestions() {
  const input = $('diagnosis-input');
  suggestions = searchDiagnoses(input.value).slice(0,5);
  if (!input.value.trim()) { closeSuggestions(); return; }
  $('suggestions').replaceChildren();
  if (!suggestions.length) {
    const li = document.createElement('li'); li.className = 'no-results'; li.setAttribute('role', 'presentation');
    li.textContent = 'Не найдено. Попробуйте другое название или сокращение.'; $('suggestions').append(li);
  }
  suggestions.forEach((item, index) => {
    const li = document.createElement('li'); li.id = 'diagnosis-option-' + index; li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(index === activeOption)); li.innerHTML = highlightMatch(item.name,input.value);
    const alias = item.aliases.find(a => normalize(a).includes(normalize(input.value)));
    if (alias && !normalize(item.name).includes(normalize(input.value))) {
      const small = document.createElement('small'); small.innerHTML = highlightMatch(alias,input.value); li.append(small);
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
  $('case-number').textContent = mode === 'daily' ? 'Случай дня' : `Случай ${practiceIndex % CASES.length + 1}`;
  $('case-date').textContent = mode === 'daily' ? new Date(today + 'T12:00:00+03:00').toLocaleDateString('ru-RU', { day:'numeric', month:'long' }) : '';
  $('case-date').dateTime = mode === 'daily' ? today : '';
  $('patient-meta').textContent = caseData.patient;
  $('archive-return').hidden = mode === 'daily';
  $('complaint').textContent = caseData.complaint;
  $('bookmark-button').textContent = bookmarks[caseData.id] ? 'В закладках' : 'Сохранить';
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
  result.className = 'result result-card' + (won ? '' : ' lost');
  result.innerHTML = `<div class="result-hero"><p class="result-eyebrow">${won?'Верно':'Случай завершён'}</p><h2>${escapeHTML(getDiagnosis(caseData.diagnosis).name)}</h2><p class="result-subtitle">${won?'Диагноз найден':'Ответ не найден'} · ${game.guesses.length} из 6 попыток</p><div class="result-grid" aria-label="${game.guesses.length} из 6 попыток">${Array.from({length:6},(_,i)=>`<span class="result-step ${i<game.guesses.length?'used':''} ${won&&i===game.guesses.length-1?'correct':''}">${won&&i===game.guesses.length-1?'✓':i<game.guesses.length?'−':''}</span>`).join('')}</div><button id="next-button" class="primary-button">Следующий случай</button><button id="share-button" class="text-button">Поделиться результатом</button></div><details class="result-review"><summary>Разбор случая</summary><p class="result-body">${escapeHTML(caseData.explanation)}</p><p class="takeaway">${escapeHTML(caseData.takeaway)}</p>${reviewHTML(game,caseData)}<button id="retry-case" class="text-button">Пройти заново</button></details>`;
  $('challenge-button').addEventListener('click',()=>showChallenge(caseData));
  $('telegram-share').addEventListener('click',()=>{const u=new URL('https://t.me/share/url');u.searchParams.set('url',caseLink());u.searchParams.set('text',shareText(current(),mode));window.open(u.href,'_blank','noopener,noreferrer');});
  $('retry-case').addEventListener('click',()=>restartCase(caseData.id));
  $('share-button').addEventListener('click',shareResult);
  $('next-button').addEventListener('click',nextUnseen);
}
function highlightMatch(text, query) {
  const q=normalize(query), n=normalize(text), start=n.indexOf(q);
  if(!q||start<0)return escapeHTML(text);
  // Match against the original string so punctuation cannot shift the highlight.
  const folded=String(text).toLowerCase().replaceAll('ё','е');
  const i=folded.indexOf(String(query).toLowerCase().replaceAll('ё','е').trim());
  if(i<0)return escapeHTML(text);
  const len=String(query).trim().length;
  return escapeHTML(text.slice(0,i))+'<mark>'+escapeHTML(text.slice(i,i+len))+'</mark>'+escapeHTML(text.slice(i+len));
}
function progressState(){return {records,practiceRecords:{...practiceRecords,[practice.caseId]:practice},repeatLog,visited};}
function caseProgress(c){return progressFor(c.id,progressState());}
function nextUnseen(){
  const pool=unseenCases(CASES,progressState(),[daily.caseId,current().caseId]);
  if(pool.length){openCase(pool[Math.floor(Math.random()*pool.length)].id);return;}
  openModal('<h2>Все случаи открыты</h2><p>Новые задачи закончились. Можно вернуться к ошибкам или продолжить начатые случаи в архиве.</p><button class="modal-start" id="open-errors">Повторить ошибки</button><button class="text-button" id="open-archive">Открыть архив</button>');
  $('open-errors').onclick=()=>showArchive('Ошибки');$('open-archive').onclick=()=>showArchive('Новые');
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
$('practice-tab').addEventListener('click',()=>showArchive('Новые'));
$('archive-return').addEventListener('click',()=>showArchive(archiveStatus));
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
      records = next.records; daily = restoreGame(records[today], dailyCase(today).id, today);
      if(next.practiceRecords)practiceRecords=next.practiceRecords;
      if(mode==='practice'&&practiceRecords[practice.caseId])practice=restoreGame(practiceRecords[practice.caseId],practice.caseId);
      if(Array.isArray(next.visited))visited=next.visited;
      if(Array.isArray(next.repeatLog))repeatLog=next.repeatLog;
      if(next.bookmarks)bookmarks=next.bookmarks;
      if(next.tipDismissed){tipDismissed=true;$('first-tip').hidden=true;}
      resetInput(); render();
    }
  } catch { /* Ignore an invalid update from another tab. */ }
});
$('errors-button').addEventListener('click',()=>showArchive('Ошибки'));
$('site-menu').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{$('site-menu').open=false;}));
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#site-menu'))$('site-menu').open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('site-menu').open=false;});
$('dismiss-tip').onclick=()=>{tipDismissed=true;$('first-tip').hidden=true;persist();};
$('first-tip').hidden=tipDismissed;
setTheme(theme); render();
setInterval(() => { checkNewDay(); updateClock(); }, 1000);
if (!storageAvailable) toast('Сохранение недоступно в этом браузере. Игра работает до закрытия страницы.');

function caseLink(){const u=new URL(location.pathname, location.origin);u.searchParams.set('case',current().caseId);return u.href;}
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
function showArchive(tab='Новые'){
 archiveStatus=tab;archivePage=0;
 openModal(`<div class="archive-title"><h2>Архив случаев</h2><span>${CASES.length} случаев</span></div><div class="archive-tabs" role="group" aria-label="Разделы архива">${['Новые','Ошибки','Закладки','Пройденные'].map(x=>`<button data-archive-tab="${x}" aria-pressed="${x===tab}">${x}</button>`).join('')}</div><p id="archive-caption" class="archive-caption"></p><div id="archive-list"></div><div class="archive-pagination"><button id="archive-prev" aria-label="Предыдущая страница">←</button><span id="archive-page"></span><button id="archive-next" aria-label="Следующая страница">→</button></div><button class="modal-start" id="random-case">Новый случай</button>`);
 document.querySelectorAll('[data-archive-tab]').forEach(b=>b.onclick=()=>{archiveStatus=b.dataset.archiveTab;archivePage=0;renderArchive();});
 $('archive-prev').onclick=()=>{archivePage--;renderArchive();};$('archive-next').onclick=()=>{archivePage++;renderArchive();};
 $('random-case').onclick=()=>{if(archiveStatus==='Ошибки'){const c=archivePool()[0];if(c)repeatCase(c.id);}else nextUnseen();};renderArchive();
}
function archiveGame(c){
 const p=caseProgress(c),saved=p.game;
 return restoreGame(saved,c.id);
}
function archivePool(){return CASES.filter(c=>{const p=caseProgress(c);return archiveStatus==='Закладки'?!!bookmarks[c.id]:archiveStatus==='Ошибки'?p.error:archiveStatus==='Пройденные'?p.solved:!p.solved&&!p.error;});}
function renderArchive(){
 const pool=archivePool(), pages=Math.max(1,Math.ceil(pool.length/6));archivePage=Math.max(0,Math.min(archivePage,pages-1));
 document.querySelectorAll('[data-archive-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.archiveTab===archiveStatus)));
 $('archive-caption').textContent=archiveStatus==='Ошибки'?'Случаи, которые пока не удалось решить. Повтор не меняет результат дня.':archiveStatus==='Новые'?'Непройденные случаи и незавершённые попытки.':'';
 $('archive-list').innerHTML=pool.length?pool.slice(archivePage*6,archivePage*6+6).map(c=>{const p=caseProgress(c),g=archiveGame(c);return `<button class="archive-case" data-case="${c.id}"><span class="archive-id">${String(CASES.indexOf(c)+1).padStart(2,'0')}</span><span><strong>${escapeHTML(p.solved?getDiagnosis(c.diagnosis).name:c.patient)}</strong><small>${p.solved?'Решён':p.error?(p.inProgress?'Продолжить повторение':'Повторить'):g.guesses.length?'Продолжить · '+g.guesses.length+'/6':'Не начат'}</small></span></button>`;}).join(''):`<div class="archive-empty">${archiveStatus==='Ошибки'?'Ошибок для повторения пока нет.':archiveStatus==='Закладки'?'Сохраните интересный случай — он появится здесь.':archiveStatus==='Пройденные'?'Здесь появятся решённые случаи.':'Все случаи завершены.'}</div>`;
 $('archive-list').querySelectorAll('[data-case]').forEach(b=>b.onclick=()=>{const c=getCase(b.dataset.case);if(caseProgress(c).error)repeatCase(c.id);else openCase(c.id);});
 $('archive-page').textContent=`${archivePage+1} / ${pages}`;$('archive-prev').disabled=archivePage===0;$('archive-next').disabled=archivePage===pages-1;
 document.querySelector('.archive-pagination').hidden=pages===1;
 $('random-case').hidden=archiveStatus==='Пройденные'||archiveStatus==='Закладки';
 $('random-case').textContent=archiveStatus==='Ошибки'?'Повторить ошибку':'Новый случай';
 $('random-case').disabled=archiveStatus==='Ошибки'?!pool.length:!unseenCases(CASES,progressState(),[daily.caseId,current().caseId]).length;
}
function repeatCase(id){
 if(id===daily.caseId&&daily.status==='playing'){setMode('daily');$('modal').close();toast('Сначала завершите сегодняшний случай.');return;}
 const g=archiveGame(getCase(id));
 if(g.status==='playing'&&g.guesses.length)openCase(id,true);else restartCase(id);
}

function openCase(id, repeating=false){
 if(id===daily.caseId&&!repeating){setMode('daily');$('modal').close();return;}
 const selectedSaved=repeating?restoreGame(practiceRecords[id],id):archiveGame(getCase(id));
 practiceRecords[practice.caseId]=practice;practiceIndex=CASES.findIndex(c=>c.id===id);if(practiceIndex<0)return;
 practice=selectedSaved;mode='practice';if(!visited.includes(id))visited.push(id);resetInput();persist();render();$('modal').close();
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
 const previous=archiveGame(getCase(id));repeatLog.push({...previous,repeatedAt:new Date().toISOString()});repeatLog=repeatLog.slice(-100);practiceRecords[id]=createGame(id);if(practice.caseId===id)practice=practiceRecords[id];openCase(id,true);
}
