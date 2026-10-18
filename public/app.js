const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtH = (m) => (m == null ? '–' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const tf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const nonNull = (a) => a.filter((v) => v != null);

const recColor = (r) => (r >= 67 ? css('--rec-hi') : r >= 34 ? css('--rec-mid') : css('--rec-lo'));
const recWord = (r) => (r >= 67 ? 'Primed' : r >= 34 ? 'Moderate' : 'Take it easy');
const recPat = (r) => (r < 34 ? 'p-low' : null);
const recLegend = () => `<div class="legend"><span><i class="sw lv-hi"></i><b>Primed</b> 67–100</span><span><i class="sw lv-mid"></i><b>Moderate</b> 34–66</span><span><i class="sw lv-lo"></i><b>Low</b> 0–33</span></div>`;
const scoreWord = (s) => (s >= 85 ? 'Excellent' : s >= 70 ? 'Good' : s >= 50 ? 'Fair' : 'Poor');

const ICON = {
  today: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  sleep: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  recovery: '<path d="M3 12h4l2.5-7 4 14 3-9 1.5 2H21"/>',
  activity: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  trends: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  coach: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  good: '<path d="M20 6L9 17l-5-5"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;
const VIEWS = [['today', 'Today'], ['sleep', 'Sleep'], ['recovery', 'Recovery'], ['activity', 'Activity'], ['trends', 'Trends'], ['coach', 'Coach']];
const LEVEL = { alert: ['--rec-lo', 'alert'], warn: ['--rec-mid', 'alert'], info: ['--strain', 'info'], good: ['--rec-hi', 'good'] };

const S = { data: null, state: null, view: location.hash.slice(1) || 'today', range: 30, chat: [], brief: null, briefLoading: false, allInsights: false };
if (!VIEWS.some(([k]) => k === S.view)) S.view = 'today';

// ---------- data helpers ----------
const days = () => S.data.days;
const last = () => days()[days().length - 1];
const lastWith = (f) => [...days()].reverse().find(f);
const win = (n = S.range) => days().slice(-n);
const A = () => S.data.analytics;

function delta(now, prev, { dec = 0, good = 1, unit = '' } = {}) {
  if (now == null || prev == null) return '<span class="flat">–</span>';
  const d = round(now - prev, dec);
  if (d === 0) return '<span class="flat">0</span>';
  const cls = good === 0 ? 'flat' : (d > 0) === (good > 0) ? 'up' : 'down';
  return `<span class="${cls}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit}</span>`;
}

function md(text) {
  const lines = esc(text).split('\n');
  let html = '', list = false;
  const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const ln of lines) {
    const m = ln.match(/^\s*[-*•]\s+(.*)/);
    if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(m[1])}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (ln.trim()) html += `<p>${inline(ln)}</p>`;
  }
  return html + (list ? '</ul>' : '');
}

// ---------- shared pieces ----------
function insightsList(items, limit) {
  const shown = limit ? items.slice(0, limit) : items;
  return shown.map((i) => { const [c, ic] = LEVEL[i.level]; return `<div class="ins" style="--c:var(${c})"><div class="ico">${svg(ic)}</div><div class="insb"><b>${esc(i.title)}<span class="tg">${esc(i.tag)}</span></b><p>${esc(i.why || i.body)}</p>${i.steps?.length ? `<div class="dolabel">What to do</div><ul class="steps">${i.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</div></div>`; }).join('');
}
function ringCard(go, label, ringOpts, status, glow) {
  return `<div class="herocard" data-go="${go}" style="--glow:${glow}" role="link" tabindex="0">${C.ring({ ...ringOpts, label })}<div class="lab">${label}</div><div class="st">${status}</div></div>`;
}
function rangeSeg() {
  return `<div class="seg" role="group" aria-label="Range">${[7, 30, 90].map((n) => `<button data-range="${n}" aria-pressed="${S.range === n}">${n}D</button>`).join('')}</div>`;
}
function targetBar(strain, band) {
  const pct = (v) => `${(clamp(v, 0, 21) / 21) * 100}%`;
  return `<div class="target"><div class="track"></div>${band ? `<div class="band" style="left:${pct(band[0])};width:${(band[1] - band[0]) / 21 * 100}%"></div>` : ''}<div class="fill" style="width:${pct(strain || 0)}"></div><div class="pin" style="left:${pct(strain || 0)}"></div></div><div class="scale"><span>0</span><span>7</span><span>14</span><span>21</span></div>`;
}

// ---------- views ----------
function viewToday() {
  const rec = lastWith((d) => d.recovery != null), sl = lastWith((d) => d.sleepScore != null), t = last();
  const a = A(), plan = a.sleepPlan;
  const hero = `<div class="hero">
    ${ringCard('recovery', 'Recovery', { value: rec?.recovery, max: 100, color: rec ? recColor(rec.recovery) : css('--line'), color2: rec ? recColor(rec.recovery) : css('--line'), text: rec ? rec.recovery + '%' : '–', size: 190 }, rec ? recWord(rec.recovery) : 'Needs ~5 days of data', rec ? recColor(rec.recovery) : 'transparent')}
    ${ringCard('sleep', 'Sleep', { value: sl?.sleepScore, max: 100, color: css('--sleep'), color2: css('--sleep2'), text: sl ? sl.sleepScore + '%' : '–', size: 190 }, sl ? `${fmtH(sl.sleep.asleep)} · ${scoreWord(sl.sleepScore)}` : 'No sleep yet', css('--sleep'))}
    ${ringCard('activity', 'Strain', { value: t?.strain, max: 21, color: css('--strain'), color2: css('--strain2'), text: t?.strain != null ? t.strain.toFixed(1) : '–', size: 190 }, t ? `${(t.steps || 0).toLocaleString()} steps` : '', css('--strain'))}
  </div>`;

  const brief = S.data.aiEnabled
    ? `<div class="card"><h3>Your briefing <small>${S.brief ? 'AI coach' : ''}</small></h3><div class="md" id="brief">${S.brief ? md(S.brief) : '<div class="skeleton"></div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:60%"></div>'}</div></div>`
    : `<div class="card"><h3>Today's plan</h3><div class="md"><p><strong>Effort:</strong> ${a.targetStrain ? `aim for strain ${a.targetStrain[0]}–${a.targetStrain[1]}` : 'building your baseline'}${rec ? ` (recovery ${rec.recovery}%)` : ''}.</p><p><strong>Tonight:</strong> in bed by ${plan.bedtime} for ${fmtH(plan.needMin)} of sleep.</p></div><p class="sub">Add a free GROQ_API_KEY to unlock an AI-written daily briefing and coach chat.</p></div>`;

  const tonight = `<div class="card"><h3>Tonight <small>sleep plan</small></h3>
    <div class="big">${plan.bedtime}</div><div class="sub" style="margin-top:6px">Target bedtime for wake-up around ${plan.wake}</div>
    <div class="kv"><div><small>Sleep need</small><b>${fmtH(plan.needMin)}</b></div><div><small>Base</small><b>${fmtH(plan.baseMin)}</b></div><div><small>Weekly debt</small><b>${fmtH(plan.debtMin)}</b></div>${plan.strainAdjMin ? `<div><small>Strain add-on</small><b>+${plan.strainAdjMin}m</b></div>` : ''}</div></div>`;

  const strain = `<div class="card"><h3>Strain today <small>${a.targetStrain ? `target ${a.targetStrain[0]}–${a.targetStrain[1]}` : ''}</small></h3>
    <div style="display:flex;align-items:baseline;gap:10px"><span class="big">${t?.strain != null ? t.strain.toFixed(1) : '–'}</span><span class="sub">of 21</span></div>${targetBar(t?.strain, a.targetStrain)}
    ${t?.workouts?.length ? t.workouts.map(wkRow).join('') : '<p class="sub" style="margin:12px 0 0">No workouts logged today.</p>'}</div>`;

  const items = S.data.insights;
  const ins = `<div class="card"><h3>Insights for you <small>${items.length} active</small></h3>${items.length ? insightsList(items, S.allInsights ? 0 : 4) : '<p class="sub">Insights appear once a few days of data have synced.</p>'}${items.length > 4 ? `<button class="more" id="moreIns">${S.allInsights ? 'Show less' : `Show all ${items.length}`}</button>` : ''}</div>`;

  const n = sl?.sleep, nightCard = n ? `<div class="card"><h3>Last night <small>${sl.date}</small></h3>${C.hypnogram(n)}<div class="kv"><div><small>Asleep</small><b>${fmtH(n.asleep)}</b></div><div><small>Deep</small><b>${fmtH(n.deep)}</b></div><div><small>REM</small><b>${fmtH(n.rem)}</b></div><div><small>HRV</small><b>${sl.hrv ?? '–'} ms</b></div><div><small>Resting HR</small><b>${sl.rhr ?? '–'}</b></div></div></div>` : '';
  return `<div class="stack">${hero}${brief}<div class="grid2">${strain}${tonight}</div>${ins}${nightCard}</div>`;
}

function wkRow(w) {
  return `<div class="wk"><div class="ico">${esc((w.name || '?')[0].toUpperCase())}</div><div class="m"><b>${esc(w.name)}</b><span class="sub">${w.start ? new Date(w.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + tf(w.start) : ''}</span></div>
  <div class="st2"><div><b>${w.min ?? '–'}</b><small>min</small></div><div><b>${w.kcal ?? '–'}</b><small>kcal</small></div><div><b>${w.avgHr ?? '–'}</b><small>avg bpm</small></div><div><b>${w.azm ?? '–'}</b><small>AZM</small></div></div></div>`;
}

function viewSleep() {
  const sl = lastWith((d) => d.sleepScore != null);
  if (!sl) return '<div class="card"><div class="empty">No sleep data yet. It appears after your first synced night.</div></div>';
  const n = sl.sleep, p = sl.sleepParts, plan = A().sleepPlan, tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const bar = (name, v, col) => `<div class="minibar"><span class="n">${name}</span><div class="meter"><i style="left:0;width:${v ?? 0}%;background:${col}"></i></div><span class="v">${v ?? '–'}${v != null ? '%' : ''}</span></div>`;
  const tot = (n.deep || 0) + (n.rem || 0) + (n.light || 0), awake = n.awake || 0, all = tot + awake || 1;
  const seg = (m, cls) => `<i class="${cls}" style="width:${(m / all) * 100}%"></i>`;
  const stageRow = (name, m, col, ideal) => { const pct = tot ? Math.round((m / tot) * 100) : null; return `<div class="minibar"><span class="n"><i class="sw ${col}"></i>${name}</span><div class="meter"><i class="${col}" style="left:0;width:${pct ?? 0}%"></i></div><span class="v" style="width:auto;min-width:90px">${fmtH(m)} <span class="sub">${pct ?? '–'}%</span></span></div><div class="sub" style="margin:-6px 0 0 116px;font-size:12px">typical ${ideal}</div>`; };
  return `<div class="stack">${rangeSeg()}
  <div class="grid2">
    <div class="card"><h3>Sleep performance <small>${sl.date}</small></h3><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div style="width:150px">${C.ring({ value: sl.sleepScore, max: 100, color: css('--sleep'), color2: css('--sleep2'), text: sl.sleepScore + '%', size: 150, label: 'Sleep' })}</div>
      <div style="flex:1;min-width:200px">${bar('Duration', p?.duration, css('--sleep'))}${bar('Efficiency', p?.efficiency, css('--sleep'))}${bar('Restorative', p?.restorative, css('--sleep'))}${bar('Consistency', p?.consistency, css('--sleep'))}</div></div>
      <div class="kv"><div><small>Asleep</small><b>${fmtH(n.asleep)}</b></div><div><small>In bed</small><b>${fmtH(n.inBed)}</b></div><div><small>To fall asleep</small><b>${n.latency ?? '–'} min</b></div><div><small>Bed → wake</small><b style="font-size:15px">${tf(n.start)} – ${tf(n.end)}</b></div></div></div>
    <div class="card"><h3>Tonight <small>sleep plan</small></h3><div class="big">${plan.bedtime}</div><div class="sub" style="margin:6px 0 14px">Bedtime for a ${plan.wake} wake-up</div>
      <div class="minibar"><span class="n">Need tonight</span><div class="meter"><i style="left:0;width:${Math.min(100, Math.round(plan.needMin / 6))}%;background:var(--sleep2)"></i></div><span class="v" style="width:auto;min-width:70px">${fmtH(plan.needMin)}</span></div>
      <div class="kv"><div><small>Base need</small><b>${fmtH(plan.baseMin)}</b></div><div><small>Debt (7d)</small><b>${fmtH(plan.debtMin)}</b></div><div><small>Avg bedtime</small><b>${A().avgBedtime ?? '–'}</b></div><div><small>Variability</small><b>±${A().bedtimeSd ?? '–'}m</b></div></div></div>
  </div>
  <div class="card"><h3>Night timeline <small>tap a block</small></h3>${C.hypnogram(n)}
    <div class="stagebar">${seg(n.deep || 0, 'st-deep')}${seg(n.rem || 0, 'st-rem')}${seg(n.light || 0, 'st-light')}${seg(awake, 'st-awake')}</div>
    <div class="legend" style="margin:0 0 6px"><span><i class="sw st-deep"></i>Deep</span><span><i class="sw st-rem"></i>REM</span><span><i class="sw st-light"></i>Light</span><span><i class="sw st-awake"></i>Awake</span></div>
    ${stageRow('Deep', n.deep || 0, 'st-deep', '13–23%')}${stageRow('REM', n.rem || 0, 'st-rem', '20–25%')}${stageRow('Light', n.light || 0, 'st-light', '45–55%')}</div>
  <div class="grid2"><div class="card"><h3>Sleep per night <small>hours by stage</small></h3>${C.sleepStack(win(), plan.baseMin)}</div>
    <div class="card"><h3>Bed & wake times <small>consistency</small></h3>${C.sleepWindow(win(), tz)}</div></div>
  <div class="grid2"><div class="card"><h3>Sleep score</h3>${C.bars(win(), (d) => d.sleepScore, { min: 0, max: 100, color: css('--sleep'), unit: '%', label: 'sleep score' })}</div>
    <div class="card"><h3>Time to fall asleep <small>minutes</small></h3>${C.line(win(), (d) => d.sleep?.latency, { color: css('--sleep2'), unit: ' min', band: true })}</div></div></div>`;
}

function contribRow(c) {
  const col = c.status === 'good' ? css('--rec-hi') : c.status === 'bad' ? css('--rec-lo') : css('--mut');
  const pos = clamp(0.5 + c.delta / (6 * c.sd), 0.03, 0.97) * 100;
  const word = c.status === 'good' ? 'Better than usual' : c.status === 'bad' ? 'Off baseline' : 'In your normal range';
  return `<div class="contrib" style="--c:${col}"><div class="row"><b>${c.label}</b><span>${round(c.value, c.dec)}${c.unit} <span class="sub">· baseline ${round(c.base, c.dec)}${c.unit}</span></span></div><div class="range"><div class="b"></div><div class="m" style="left:${pos}%"></div></div><div class="sub" style="margin-top:6px;font-size:12px;color:${col}">${word}</div></div>`;
}

function viewRecovery() {
  const rec = lastWith((d) => d.recovery != null);
  if (!rec) return '<div class="card"><div class="empty">Recovery needs about 5 days of history to learn your baseline.</div></div>';
  const w = win(), a = A();
  const drivers = a.drivers.length ? a.drivers.map((d) => { const w50 = Math.abs(d.r) * 50; return `<div class="drv"><span class="n">${esc(d.label)}</span><div class="ax2"><i style="${d.r >= 0 ? 'left:50%' : `left:${50 - w50}%`};width:${w50}%;background:${d.r >= 0 ? css('--rec-hi') : css('--rec-lo')}"></i></div><span class="v">${d.r > 0 ? '+' : ''}${d.r}</span></div>`; }).join('') + `<p class="sub">How each day-before factor lines up with your next-morning recovery (−1 to +1, from your last ${a.drivers[0].n} days). Correlation, not proof.</p>` : '<p class="sub">Needs ~2 weeks of data.</p>';
  const mini = (title, key, color, unit, dec) => `<div class="card"><h3>${title} <small>${unit}</small></h3>${C.line(w, (d) => d[key], { color, band: true, unit: ' ' + unit, dec, fmt: (v) => round(v, dec) })}</div>`;
  return `<div class="stack">${rangeSeg()}
  <div class="grid2">
    <div class="card"><h3>Recovery <small>${rec.date}</small></h3><div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"><div style="width:160px">${C.ring({ value: rec.recovery, max: 100, color: recColor(rec.recovery), text: rec.recovery + '%', size: 160, label: 'Recovery' })}</div><div style="flex:1;min-width:180px"><div class="chip ${rec.recovery >= 67 ? 'good' : rec.recovery >= 34 ? 'warn' : 'bad'}">${recWord(rec.recovery)}</div><p class="sub" style="margin:10px 0 0">Target strain <b style="color:var(--tx)">${a.targetStrain[0]}–${a.targetStrain[1]}</b> today.</p></div></div></div>
    <div class="card"><h3>What's driving it <small>vs your 28-day baseline</small></h3>${rec.contrib.length ? rec.contrib.map(contribRow).join('') : '<p class="sub">No contributors yet.</p>'}</div>
  </div>
  <div class="card"><h3>Recovery score</h3>${recLegend()}${C.bars(w, (d) => d.recovery, { min: 0, max: 100, colorFn: recColor, patternFn: recPat, fmt: (v) => v + '% · ' + recWord(v), unit: '', label: 'recovery score', wide: true })}</div>
  <div class="grid2">${mini('Heart rate variability', 'hrv', css('--rec-hi'), 'ms', 0)}${mini('Resting heart rate', 'rhr', css('--rec-lo'), 'bpm', 0)}${mini('Respiratory rate', 'resp', css('--strain'), 'rpm', 1)}${mini('Blood oxygen', 'spo2', css('--sleep'), '%', 1)}${w.some((d) => d.temp != null) ? mini('Skin temperature', 'temp', css('--rec-mid'), '°C vs baseline', 2) : ''}${w.some((d) => d.vo2 != null) ? mini('VO₂ max', 'vo2', css('--accent'), 'ml/kg/min', 1) : ''}</div>
  <div class="card"><h3>What moves your recovery</h3>${drivers}</div></div>`;
}

function viewActivity() {
  const w = win(), t = last(), a = A();
  const wks = [...days()].reverse().flatMap((d) => (d.workouts || []).map((x) => x)).sort((x, y) => y.start.localeCompare(x.start)).slice(0, 12);
  const azmPct = clamp((a.weekTotals.azm / 150) * 100, 0, 100);
  const strainCol = (v) => (v >= 14 ? css('--strain') : v >= 8 ? css('--strain2') : css('--mut'));
  return `<div class="stack">${rangeSeg()}
  <div class="grid2">
    <div class="card"><h3>Strain today <small>${a.targetStrain ? `target ${a.targetStrain[0]}–${a.targetStrain[1]}` : ''}</small></h3><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div style="width:150px">${C.ring({ value: t?.strain, max: 21, color: css('--strain'), color2: css('--strain2'), text: t?.strain != null ? t.strain.toFixed(1) : '–', size: 150, label: 'Strain' })}</div><div style="flex:1;min-width:180px">${targetBar(t?.strain, a.targetStrain)}</div></div>
      <div class="kv"><div><small>Steps</small><b>${(t?.steps || 0).toLocaleString()}</b></div><div><small>Active zone min</small><b>${t?.azm || 0}</b></div><div><small>Workout min</small><b>${t?.exMin || 0}</b></div></div></div>
    <div class="card"><h3>Weekly heart-health goal <small>150 active zone min</small></h3><div class="big">${a.weekTotals.azm}<span class="sub" style="font-size:16px;font-weight:500"> / 150</span></div><div class="meter" style="margin:14px 0"><i style="left:0;width:${azmPct}%;background:linear-gradient(90deg,var(--strain),var(--strain2))"></i></div><p class="sub" style="margin:0">${a.weekTotals.workouts} workout${a.weekTotals.workouts === 1 ? '' : 's'} in the last 7 days.</p></div>
  </div>
  <div class="card"><h3>Daily strain</h3>${C.bars(w, (d) => d.strain, { min: 0, max: 21, colorFn: strainCol, label: 'daily strain', fmt: (v) => v.toFixed(1), wide: true })}</div>
  <div class="grid2"><div class="card"><h3>Steps</h3>${C.bars(w, (d) => d.steps, { color: css('--strain2'), label: 'steps', fmt: (v) => Math.round(v).toLocaleString() })}</div><div class="card"><h3>Active zone minutes</h3>${C.bars(w, (d) => d.azm, { color: css('--strain'), label: 'active zone minutes' })}</div></div>
  <div class="card"><h3>Recent workouts <small>${wks.length}</small></h3>${wks.length ? wks.map(wkRow).join('') : '<p class="sub">No workouts in this period. Start one on your Fitbit Air and it will show up here.</p>'}</div></div>`;
}

function viewTrends() {
  const a = A(), w = win();
  const rows = a.weekly.map((r) => `<tr><td>${r.label}</td><td>${r.label === 'Sleep' ? fmtH(r.now) : r.now ?? '–'}${r.label === 'Recovery' && r.now != null ? '%' : ''}</td><td>${r.label === 'Sleep' ? fmtH(r.prev) : r.prev ?? '–'}</td><td>${delta(r.now, r.prev, { dec: r.label === 'Strain' ? 1 : 0, good: r.good, unit: r.label === 'Sleep' ? 'm' : '' })}</td></tr>`).join('');
  const sp = (key, color) => C.spark(w.map((d) => d[key]), color);
  const st = (label, key, color, unit, dec = 0) => { const v = nonNull(w.map((d) => d[key])); const avg = v.length ? round(C.mean(v), dec) : null; return `<div><small>${label}</small><b>${avg ?? '–'}<span class="sub" style="font-size:12px;font-weight:500"> ${unit}</span></b>${sp(key, color)}</div>`; };
  return `<div class="stack">${rangeSeg()}
  <div class="card"><h3>Averages <small>last ${S.range} days</small></h3><div class="kv" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">${st('Recovery', 'recovery', css('--rec-hi'), '%')}${st('HRV', 'hrv', css('--rec-hi'), 'ms')}${st('Resting HR', 'rhr', css('--rec-lo'), 'bpm')}${st('Sleep score', 'sleepScore', css('--sleep'), '%')}${st('Strain', 'strain', css('--strain'), '', 1)}${st('Steps', 'steps', css('--strain2'), '')}</div></div>
  <div class="grid2"><div class="card"><h3>This week vs last <small>7-day averages</small></h3><table class="tbl"><thead><tr><th></th><th>This week</th><th>Last</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card"><h3>Highlights</h3>${a.best ? `<div class="kv" style="grid-template-columns:1fr 1fr"><div><small>Best recovery</small><b style="color:var(--rec-hi)">${a.best.recovery}%</b><div class="sub" style="font-size:12px">${C.fmtDate(a.best.date)}</div></div><div><small>Lowest recovery</small><b style="color:var(--rec-lo)">${a.worst.recovery}%</b><div class="sub" style="font-size:12px">${C.fmtDate(a.worst.date)}</div></div></div>` : '<p class="sub">Highlights appear after a week of data.</p>'}
      <div class="kv" style="grid-template-columns:1fr 1fr"><div><small>Avg bedtime</small><b>${a.avgBedtime ?? '–'}</b></div><div><small>Bedtime variability</small><b>±${a.bedtimeSd ?? '–'}m</b></div></div></div></div>
  <div class="card"><h3>Recovery calendar <small>blue primed · yellow moderate · hatched low</small></h3>${C.heatmap(days(), (d) => d.recovery, recColor, (v) => v + '% · ' + recWord(v), recPat)}${recLegend()}</div>
  <div class="grid2"><div class="card"><h3>HRV</h3>${C.line(w, (d) => d.hrv, { color: css('--rec-hi'), band: true, unit: ' ms' })}</div><div class="card"><h3>Resting heart rate</h3>${C.line(w, (d) => d.rhr, { color: css('--rec-lo'), band: true, unit: ' bpm' })}</div>
  <div class="card"><h3>Sleep duration</h3>${C.bars(w, (d) => (d.sleep?.asleep ? d.sleep.asleep / 60 : null), { color: css('--sleep'), ref: A().sleepPlan.baseMin / 60, refLabel: 'need', fmt: (v) => fmtH(v * 60), min: 0 })}</div><div class="card"><h3>Strain vs recovery</h3>${C.line(w, (d) => d.recovery, { color: css('--rec-hi'), unit: '% recovery', min: 0, max: 100 })}</div></div></div>`;
}

function viewCoach() {
  if (!S.data.aiEnabled) {
    return `<div class="card"><h3>AI coach <small>optional, free</small></h3><div class="md"><p>Turn on an AI coach that reads your sleep, recovery and training data and answers questions like <em>"why was my recovery low?"</em> or <em>"should I train hard today?"</em></p><p><strong>Setup (2 min):</strong></p><ul><li>Get a free key at console.groq.com/keys (no credit card)</li><li>In Vercel, add it as <code>GROQ_API_KEY</code></li><li>Redeploy</li></ul></div></div>`;
  }
  const chips = ['Why is my recovery what it is today?', 'Should I train hard today?', 'How can I improve my deep sleep?', 'Summarize my week', 'What is hurting my HRV?'];
  return `<div class="stack"><div class="card"><h3>Morning briefing <button class="btn ghost" id="regen" style="padding:6px 12px;font-size:12px">Regenerate</button></h3><div class="md" id="brief">${S.brief ? md(S.brief) : '<div class="skeleton"></div><div class="skeleton" style="width:80%"></div>'}</div></div>
  <div class="card"><h3>Ask your coach</h3><div class="chat" id="chat">${S.chat.map((m) => `<div class="msg ${m.role === 'user' ? 'u' : 'a'}">${m.role === 'user' ? esc(m.content) : `<div class="md">${md(m.content)}</div>`}</div>`).join('') || `<p class="sub">Ask anything about your data.</p>`}</div>
  <div class="chips">${chips.map((c) => `<button data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <form class="ask" id="askform"><input id="q" placeholder="Ask about your sleep, recovery, training…" autocomplete="off"><button class="btn">Send</button></form></div></div>`;
}

const RENDER = { today: viewToday, sleep: viewSleep, recovery: viewRecovery, activity: viewActivity, trends: viewTrends, coach: viewCoach };

// ---------- shell ----------
function renderNav() {
  $('nav').innerHTML = `<div class="brand"><svg viewBox="0 0 24 24"><path d="M2 12h4l2.5-7 4 14 3-9 1.5 2H22"/></svg>Pulse</div>` +
    VIEWS.map(([k, label]) => `<button data-view="${k}" ${k === S.view ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24">${ICON[k]}</svg><span>${label}</span></button>`).join('');
}

function render() {
  if (!S.data) return;
  const hour = new Date().getHours();
  $('title').textContent = S.view === 'today' ? (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') : VIEWS.find(([k]) => k === S.view)[1];
  const sync = S.data.source === 'demo' ? 'Demo data' : 'Synced ' + tf(S.data.fetchedAt);
  $('date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + (matchMedia('(max-width:860px)').matches ? ' · ' + sync : '');
  $('badge').textContent = S.data.source === 'demo' ? 'Demo data' : 'Synced ' + tf(S.data.fetchedAt);
  $('badge').className = 'badge' + (S.data.source === 'demo' ? ' demo' : '');
  renderNav();
  $('view').innerHTML = RENDER[S.view]();
  if (S.view === 'today' || S.view === 'coach') ensureBrief();
}

async function ensureBrief(regenerate) {
  if (!S.data.aiEnabled || S.briefLoading || (S.brief && !regenerate)) return;
  S.briefLoading = true;
  try {
    const r = await fetch('/api/coach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief: true, regenerate: !!regenerate }) });
    const j = await r.json();
    S.brief = j.text || 'Briefing unavailable: ' + (j.error || 'unknown error');
  } catch { S.brief = 'Briefing unavailable right now.'; }
  S.briefLoading = false;
  const el = $('brief'); if (el) el.innerHTML = md(S.brief);
}

async function ask(q) {
  S.chat.push({ role: 'user', content: q });
  render();
  const chat = $('chat'); chat.insertAdjacentHTML('beforeend', '<div class="msg a" id="typing"><div class="skeleton" style="width:160px"></div></div>');
  try {
    const r = await fetch('/api/coach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: S.chat }) });
    const j = await r.json();
    S.chat.push({ role: 'assistant', content: j.text || j.error || 'Something went wrong.' });
  } catch { S.chat.push({ role: 'assistant', content: 'Could not reach the coach.' }); }
  render();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function settingsBody() {
  const st = S.data.status || {};
  const diag = Object.keys(st).length ? `<div class="diag"><b style="color:var(--tx)">Data connection</b><br>${Object.entries(st).map(([k, v]) => `${esc(k)}: ${v.ok ? `<span class="ok">${v.count} records</span>` : `<span class="er">${esc(v.error)}</span>`}`).join('<br>')}</div>` : '';
  const real = S.data.source !== 'demo' || S.state?.connected;
  return `<label>Baseline sleep need <span><input id="need" type="number" min="5" max="11" step="0.25" value="${S.data.prefs.sleepNeedHours}"> h</span></label>
  ${diag}
  ${S.state?.connected ? '<form method="post" action="/api/disconnect" onsubmit="return confirm(\'Disconnect and delete stored Fitbit data?\')"><button class="btn red">Disconnect Fitbit</button></form>' : (S.state?.demoDeployment ? '' : '<a class="btn" href="/api/connect" style="text-align:center;text-decoration:none">Connect Fitbit</a>')}
  ${S.state?.demoDeployment ? '' : '<form method="post" action="/api/logout"><button class="btn ghost" style="width:100%">Sign out</button></form>'}`;
}

async function load(refresh) {
  const btn = $('refresh'); btn.classList.add('spin');
  try {
    S.state = await (await fetch('/api/state')).json();
    const r = await fetch('/api/data' + (refresh ? '?refresh=1' : ''));
    const data = await r.json();
    if (data.error) { $('banner').classList.remove('hidden'); $('banner').innerHTML = 'Error: ' + esc(data.error); return; }
    S.data = data;
    const b = $('banner');
    if (!S.state.connected && !S.state.demoDeployment) {
      b.classList.remove('hidden');
      b.innerHTML = S.state.configured ? '<b>Demo mode.</b> Open Settings → Connect Fitbit to load your own data.' : `<b>Demo mode.</b> Set GOOGLE_CLIENT_ID/SECRET and DATABASE_URL to connect. Redirect URI: <code>${esc(S.state.redirectUri)}</code>`;
    } else b.classList.add('hidden');
    render();
  } finally { btn.classList.remove('spin'); }
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-view],[data-go],[data-range],[data-q],#moreIns,#regen');
  if (!t) return;
  if (t.dataset.view || t.dataset.go) { S.view = t.dataset.view || t.dataset.go; location.hash = S.view; render(); window.scrollTo(0, 0); }
  else if (t.dataset.range) { S.range = +t.dataset.range; render(); }
  else if (t.dataset.q) ask(t.dataset.q);
  else if (t.id === 'moreIns') { S.allInsights = !S.allInsights; render(); }
  else if (t.id === 'regen') { S.brief = null; $('brief').innerHTML = '<div class="skeleton"></div><div class="skeleton" style="width:80%"></div>'; ensureBrief(true); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-go]')) e.target.click(); });
document.addEventListener('submit', (e) => { if (e.target.id === 'askform') { e.preventDefault(); const q = $('q').value.trim(); if (q) ask(q); } });
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (RENDER[v] && v !== S.view) { S.view = v; render(); } });
$('refresh').onclick = () => load(true);
$('gear').onclick = () => { $('settings-body').innerHTML = settingsBody(); $('settings').showModal(); };
$('settings').addEventListener('change', async (e) => {
  if (e.target.id === 'need') { await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ sleepNeedHours: +e.target.value }) }); load(); }
});
$('settings').addEventListener('click', (e) => { if (e.target === $('settings')) $('settings').close(); });

// tooltip: hover on desktop, tap on touch
const tip = $('tip');
function showTip(e) {
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.classList.add('hidden'); return; }
  tip.innerHTML = el.dataset.tip; tip.classList.remove('hidden');
  const r = tip.getBoundingClientRect();
  tip.style.left = clamp(e.clientX + 14, 8, innerWidth - r.width - 8) + 'px';
  tip.style.top = clamp(e.clientY - r.height - 12, 8, innerHeight - r.height - 8) + 'px';
}
document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') showTip(e); });
document.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') showTip(e); });
document.addEventListener('scroll', () => tip.classList.add('hidden'), { passive: true });

load();

// re-render when crossing the phone/desktop breakpoint (charts pick their size at render time)
let wasNarrow = innerWidth < 700, rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const n = innerWidth < 700; if (n !== wasNarrow) { wasNarrow = n; render(); } }, 200); });
