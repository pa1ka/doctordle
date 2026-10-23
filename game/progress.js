// Practice selection never alters the shared daily schedule.
export function progressFor(id, {records = {}, practiceRecords = {}, repeatLog = [], visited = []} = {}) {
  const days = Object.entries(records).sort(([a],[b])=>a.localeCompare(b)).map(([,g])=>g).filter(g=>g?.caseId===id && g.guesses?.length);
  const repeats = repeatLog.filter(g=>g?.caseId===id);
  const practice = practiceRecords[id];
  const history = [...days, ...repeats, ...(practice ? [practice] : [])];
  const completed = history.filter(g=>g.status==='won'||g.status==='lost');
  const latest = completed.at(-1);
  return {seen:visited.includes(id)||history.some(g=>g.guesses?.length), solved:latest?.status==='won', error:latest?.status==='lost', inProgress:practice?.status==='playing'&&practice.guesses?.length>0, game:practice?.guesses?.length||repeats.length ? practice : days.at(-1)};
}
export function unseenCases(cases, state, excluded = []) {
  return cases.filter(c=>!excluded.includes(c.id)&&!progressFor(c.id,state).seen);
}
