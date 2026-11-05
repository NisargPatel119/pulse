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
  healthspan: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 2 4l3 2-3 2a5 5 0 0 0-2 4v4M17 2v4a5 5 0 0 1-2 4l-3 2 3 2a5 5 0 0 1 2 4v4"/>',
  insights: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
  good: '<path d="M20 6L9 17l-5-5"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;
const VIEWS = [['today', 'Today'], ['sleep', 'Sleep'], ['recovery', 'Recovery'], ['activity', 'Activity'], ['trends', 'Trends'], ['insights', 'Insights']];
const ALL_VIEWS = [...VIEWS, ['healthspan', 'Healthspan']];
const ALIAS = { coach: 'insights' };
const LEVEL = { alert: ['--rec-lo', 'alert'], warn: ['--rec-mid', 'alert'], info: ['--strain', 'info'], good: ['--rec-hi', 'good'] };

const S = { data: null, state: null, view: location.hash.slice(1) || 'today', range: 30, chat: [], brief: null, briefLoading: false, allInsights: false, sel: null, push: null };
S.view = ALIAS[S.view] || S.view;
if (!ALL_VIEWS.some(([k]) => k === S.view)) S.view = 'today';

// ---------- data helpers ----------
const days = () => S.data.days;
const selIdx = () => (S.sel == null ? days().length - 1 : clamp(S.sel, 0, days().length - 1));
const isToday = () => selIdx() === days().length - 1;
const last = () => days()[selIdx()];
const lastWith = (f) => { for (let i = selIdx(); i >= 0; i--) if (f(days()[i])) return days()[i]; };
const win = (n = S.range) => days().slice(Math.max(0, selIdx() + 1 - n), selIdx() + 1);
const A = () => { const x = S.data.analytics; return isToday() ? x : { ...x, targetStrain: null }; };

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
  return `<div class="herocard" data-go="${go}" style="--glow:${glow}" role="link" tabindex="0">${ib(go === 'activity' ? 'strain' : go)}${C.ring({ ...ringOpts, label })}<div class="lab">${label}</div><div class="st">${status}</div></div>`;
}
function rangeSeg() {
  return `<div class="seg" role="group" aria-label="Range">${[7, 30, 90].map((n) => `<button data-range="${n}" aria-pressed="${S.range === n}">${n}D</button>`).join('')}</div>`;
}
function targetBar(strain, band) {
  const pct = (v) => `${(clamp(v, 0, 21) / 21) * 100}%`;
  return `<div class="target"><div class="track"></div>${band ? `<div class="band" style="left:${pct(band[0])};width:${(band[1] - band[0]) / 21 * 100}%"></div>` : ''}<div class="fill" style="width:${pct(strain || 0)}"></div><div class="pin" style="left:${pct(strain || 0)}"></div></div><div class="scale"><span>0</span><span>7</span><span>14</span><span>21</span></div>`;
}

// ---------- views ----------
const paceWord = (p) => (p <= 0.9 ? 'aging slower than the calendar' : p >= 1.1 ? 'aging faster than the calendar' : 'aging at calendar pace');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const fmtDay = (date) => new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const DAY_VIEWS = ['today', 'sleep', 'recovery', 'activity'];
const isoDay = (d) => d.toLocaleDateString('en-CA');
const todayStr = () => isoDay(new Date());
const yesterdayStr = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDay(d); };
const dayShort = (date) => fmtDay(date).replace(/^[A-Za-z]+, /, '');
const relDay = (date) => (date === todayStr() ? 'Today' : date === yesterdayStr() ? 'Yesterday' : fmtDay(date));
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.round(m / 60)}h ago` : tf(iso);
};
// true when the newest day we have is not today, or today has no recovery yet (sleep hasn't reached Google)
function waitingForToday() {
  if (!S.data || S.data.source === 'demo' || S.data.auth?.expired || !days().length || new Date().getHours() < 4) return false;
  const t = days()[days().length - 1];
  return t.date !== todayStr() || t.recovery == null;
}
function waitCard(rec, t) {
  if (!isToday() || !waitingForToday()) return '';
  const paused = (S.autoChecks || 0) >= 12;
  return `<div class="card wait"><div class="wt"><b>Today's data isn't in yet</b><span class="sub">Showing ${rec ? 'recovery from ' + dayShort(rec.date) : 'your latest data'}. Sync your band in the Fitbit or Google Health app and Pulse will pick it up${paused ? '' : ' automatically'}. Last checked ${ago(S.data.fetchedAt)}.</span></div><button class="btn ghost" id="checkAgain">Check again</button></div>`;
}
function renderBadge() {
  if (!S.data) return;
  const demo = S.data.source === 'demo';
  const label = demo ? 'Demo data' : S.syncing ? 'Syncing…' : S.data.auth?.expired ? 'Not syncing' : 'Synced ' + ago(S.data.fetchedAt);
  $('date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + (matchMedia('(max-width:860px)').matches ? ' · ' + label : '');
  $('badge').textContent = label;
  $('badge').className = 'badge' + (demo ? ' demo' : '');
}

function dateBar() {
  const i = selIdx(), n = days().length, d = days()[i];
  return `<button class="dnav" data-day="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Previous day">‹</button>
    <div class="dlabel"><b>${relDay(d.date)}</b>${d.date === todayStr() || d.date === yesterdayStr() ? `<span>${fmtDay(d.date)}</span>` : ''}</div>
    <button class="dnav" data-day="1" ${i >= n - 1 ? 'disabled' : ''} aria-label="Next day">›</button>
    ${isToday() ? '' : '<button class="chip jump" data-day="today">Back to today</button>'}`;
}

function headline(rec, t, a) {
  if (!isToday()) return `${rec ? `Recovery ${rec.recovery}% (${recWord(rec.recovery)})` : 'No recovery score'}${t?.strain != null ? ` · strain ${t.strain.toFixed(1)}` : ''}.`;
  if (waitingForToday() && rec) return `Waiting for last night's data. Latest recovery: ${rec.recovery}% on ${dayShort(rec.date)}.`;
  if (!rec) return 'Building your baseline. Check back in a few days.';
  const [lo, hi] = a.targetStrain;
  return rec.recovery >= 67 ? `Primed. Go hard today (strain ${lo}–${hi}).` : rec.recovery >= 34 ? `Moderate. Train steady (strain ${lo}–${hi}).` : `Low recovery. Keep it easy (strain under ${hi}).`;
}

function vitalTiles() {
  const defs = [
    { key: 'hrv', label: 'HRV', unit: 'ms', good: 1, dec: 0 },
    { key: 'rhr', label: 'Resting HR', unit: 'bpm', good: -1, dec: 0 },
    win(14).some((x) => x.stress != null) ? { key: 'stress', label: 'Stress', unit: '/3', good: -1, dec: 1 } : { key: 'spo2', label: 'Blood oxygen', unit: '%', good: 1, dec: 1 },
    { key: 'steps', label: 'Steps', unit: '', good: 0, dec: 0 },
  ];
  return defs.map((v) => {
    const d = lastWith((x) => x[v.key] != null);
    if (!d) return '';
    const series = win(14).map((x) => x[v.key]);
    let chip = '';
    if (v.key === 'steps') chip = '<span class="flat">goal 8,000</span>';
    else if (v.key === 'stress') chip = `<span class="${d.stress >= 2 ? 'down' : d.stress >= 1 ? 'flat' : 'up'}">${d.stress >= 2 ? 'High' : d.stress >= 1 ? 'Moderate' : 'Low'}</span>`;
    else {
      const b = nonNull(days().filter((x) => x.date < d.date).slice(-28).map((x) => x[v.key]));
      if (b.length >= 4) {
        const diff = d[v.key] - C.mean(b), th = v.dec ? 0.3 : 1;
        chip = Math.abs(diff) < th ? '<span class="flat">≈ usual</span>' : `<span class="${(diff > 0) === (v.good > 0) ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(round(diff, v.dec))}</span>`;
      }
    }
    const val = v.key === 'steps' ? d.steps.toLocaleString() : round(d[v.key], v.dec);
    return `<div class="vt">${ib(v.key)}<div class="vl">${v.label}</div><div class="vv">${val}<small>${v.unit}</small></div><div class="vd">${chip}</div>${C.spark(series, css('--mut'), 100, 26)}</div>`;
  }).join('');
}

function healthTile() {
  const h = S.data.healthspan;
  if (!h) return '';
  if (h.needsProfile) return `<div class="card hs"><div><div class="vl">Pulse Age</div><div class="sub">Add your age and sex to see your biological age.</div></div><button class="btn ghost" id="setProfile">Set up</button></div>`;
  if (h.needsData) return `<div class="card hs"><div><div class="vl">Pulse Age</div><div class="sub">Building your baseline: ${h.daysHave} of 14 days of data.</div></div></div>`;
  const word = h.offset <= -0.1 ? `${Math.abs(h.offset)} years younger` : h.offset >= 0.1 ? `${h.offset} years older` : 'on par with your age';
  return `<div class="card hs click" data-go="healthspan" role="link" tabindex="0">${ib('healthspan')}<div><div class="vl">Pulse Age</div><div class="hsv">${h.bioAge}<small> yrs</small></div><div class="sub">${word} · age ${h.age}</div></div><div class="hspace"><span class="chip ${h.pace <= 0.9 ? 'good' : h.pace >= 1.1 ? 'bad' : ''}">Pace ${h.pace}x</span><span class="sub">${h.pace <= 0.9 ? 'slower' : h.pace >= 1.1 ? 'faster' : 'steady'}</span></div></div>`;
}

// ---- data health: which metrics are actually arriving ----
const HEALTH_METRICS = [
  ['Sleep', (d) => d.sleep?.asleep, 'Wear the band overnight, then sync before opening Pulse.'],
  ['HRV', (d) => d.hrv, 'Comes with sleep tracking; appears after a night of wear.'],
  ['Resting heart rate', (d) => d.rhr, 'Comes with sleep tracking; appears after a night of wear.'],
  ['Blood oxygen', (d) => d.spo2, 'Needs overnight SpO₂ tracking enabled in the Fitbit app.'],
  ['Breathing rate', (d) => d.resp, 'Comes with sleep tracking.'],
  ['Skin temperature', (d) => d.temp, 'Appears after several consecutive nights of wear.'],
  ['Steps', (d) => d.steps != null, 'Wear the band during the day.'],
  ['Active zone minutes', (d) => d.azm != null, 'Counted when your heart rate is elevated.'],
  ['Heart-rate detail', (d) => d.trimp != null, 'Detailed heart rate powers strain, zones and stress.'],
  ['Workouts', (d) => d.workouts?.length, 'Only present on days you exercise.', true],
  ['VO₂ max', (d) => d.vo2 != null, 'Fitbit estimates it from GPS walks or runs.', true],
];
function dataHealth() {
  const w = days().slice(-30), w14 = days().slice(-14);
  const rows = HEALTH_METRICS.map(([label, f, tip, optional]) => {
    const n = w.filter(f).length, cov = w.length ? n / w.length : 0;
    const status = optional ? (n > 0 ? 'ok' : 'opt') : cov >= 0.7 ? 'ok' : cov >= 0.3 ? 'part' : 'miss';
    return { label, tip, n, total: w.length, status, cov14: w14.length ? w14.filter(f).length / w14.length : 0, core: ['Sleep', 'HRV', 'Resting heart rate'].includes(label) };
  });
  return { rows, coreProblem: S.data.source !== 'demo' && rows.some((r) => r.core && r.cov14 < 0.5) };
}
function dataHealthHtml() {
  const { rows } = dataHealth();
  const expired = S.data.auth?.expired ? `<div class="dhr miss"><span class="dhi">✕</span><div><b>Google connection expired</b><span class="sub">Pulse can't read new data. <a class="ntfy-link" href="/api/connect">Reconnect to Google</a></span></div></div>` : '';
  const sym = { ok: '✓', part: '!', miss: '✕', opt: '–' };
  const list = rows.map((r) => `<div class="dhr ${r.status}"><span class="dhi">${sym[r.status]}</span><div><b>${r.label}</b><span class="sub">${r.status === 'opt' ? 'Not reported yet (optional)' : `${r.n} of ${r.total} days`}${r.status === 'part' || r.status === 'miss' ? ` · ${r.tip}` : ''}</span></div></div>`).join('');
  const st = S.data.status || {};
  const api = Object.keys(st).length ? `<div class="sub" style="margin-top:10px">Last sync: ${Object.entries(st).map(([k, v]) => `${esc(k)} ${v.ok ? `✓ ${v.count}` : `<span class="er">✕ ${esc(v.error)}</span>`}`).join(' · ')}</div>` : '';
  return `<div class="dolabel" style="margin-top:0">Data health (last 30 days)</div>${expired}${list}${api}`;
}

// ---- setup checklist ----
function setupSteps() {
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const p = S.data.prefs || {}, st = S.state || {};
  const steps = [];
  if (!st.demoDeployment) steps.push({ done: !!st.connected && !S.data?.auth?.expired, label: S.data?.auth?.expired ? 'Reconnect to Google' : 'Connect your Fitbit', sub: 'Sign in with Google to load your own data', href: '/api/connect' });
  steps.push({ done: !!(p.age && p.sex), label: 'Add your age and sex', sub: 'Needed for Pulse Age', act: 'settings' });
  steps.push({ done: standalone, label: 'Add Pulse to your Home Screen', sub: 'In Safari: Share, then Add to Home Screen', act: 'hint' });
  if (S.notify?.available) steps.push({ done: lsGet('pulse_ntfy_done') === '1', label: 'Turn on notifications', sub: 'Install the free ntfy app and subscribe', act: 'settings' });
  return steps;
}
function setupCard() {
  if (lsGet('pulse_setup_hidden') === '1' || !isToday()) return '';
  const steps = setupSteps(), left = steps.filter((s) => !s.done);
  if (!left.length || (S.state?.demoDeployment && left.every((s) => s.act === 'hint'))) return '';
  const done = steps.length - left.length;
  const row = (s) => { const inner = `<span class="stk ${s.done ? 'on' : ''}">${s.done ? '✓' : ''}</span><span class="stt"><b>${s.label}</b><span class="sub">${s.sub}</span></span><span class="chev">${s.done ? '' : '›'}</span>`; return s.done ? `<div class="step done">${inner}</div>` : s.href ? `<a class="step" href="${s.href}">${inner}</a>` : `<button class="step" data-act="${s.act}">${inner}</button>`; };
  return `<div class="card setup"><h3>Finish setting up <small>${done} of ${steps.length}</small></h3>${steps.map(row).join('')}<div id="homeHint" class="sub hidden" style="padding:6px 0 2px">Open this site in Safari, tap the Share button, then choose Add to Home Screen.</div><button class="more" id="hideSetup" style="padding:6px 0 0;min-height:0">Hide this</button></div>`;
}

function attention() {
  const items = S.data.insights.filter((i) => i.tag !== 'today' && (i.level === 'alert' || i.level === 'warn')).slice(0, 3);
  const dh = dataHealth();
  const rows = [];
  if (dh.coreProblem) rows.push(`<button class="attn" id="openHealth" style="--c:var(--rec-mid)"><span class="ico">${svg('alert')}</span><span class="at">Some data isn't syncing. Check data health</span><span class="chev">›</span></button>`);
  items.forEach((i) => { const [c, ic] = LEVEL[i.level]; rows.push(`<button class="attn" data-go="insights" style="--c:var(${c})"><span class="ico">${svg(ic)}</span><span class="at">${esc(i.title)}</span><span class="chev">›</span></button>`); });
  return rows.length ? rows.join('') : `<div class="allclear">${svg('good')}<span>All clear. Nothing needs your attention.</span></div>`;
}

function viewToday() {
  const rec = lastWith((d) => d.recovery != null), sl = lastWith((d) => d.sleepScore != null), t = last();
  const a = A(), plan = a.sleepPlan, today = isToday();
  const hero = `<div class="hero">
    ${ringCard('recovery', 'Recovery', { value: rec?.recovery, max: 100, color: rec ? recColor(rec.recovery) : css('--line'), color2: rec ? recColor(rec.recovery) : css('--line'), text: rec ? rec.recovery + '%' : '–', size: 190 }, rec ? recWord(rec.recovery) + (t && rec.date !== t.date ? ' · ' + dayShort(rec.date) : '') : 'Needs ~5 days of data', rec ? recColor(rec.recovery) : 'transparent')}
    ${ringCard('sleep', 'Sleep', { value: sl?.sleepScore, max: 100, color: css('--sleep'), color2: css('--sleep2'), text: sl ? sl.sleepScore + '%' : '–', size: 190 }, sl ? fmtH(sl.sleep.asleep) + (t && sl.date !== t.date ? ' · ' + dayShort(sl.date) : '') : 'No sleep yet', css('--sleep'))}
    ${ringCard('activity', 'Strain', { value: t?.strain, max: 21, color: css('--strain'), color2: css('--strain2'), text: t?.strain != null ? t.strain.toFixed(1) : '–', size: 190 }, a.targetStrain ? `target ${a.targetStrain[0]}–${a.targetStrain[1]}` : 'of 21', css('--strain'))}
  </div>`;
  const second = today
    ? `<div class="card gl" data-go="sleep">${ib('sleep')}<div class="vl">Bedtime tonight</div><div class="gv">${plan.bedtime}</div><div class="sub">${fmtH(plan.needMin)} of sleep${plan.debtMin > 60 ? ` · ${fmtH(plan.debtMin)} debt` : ''}</div></div>`
    : `<div class="card gl" data-go="sleep"><div class="vl">Slept</div><div class="gv">${sl ? tf(sl.sleep.start) : '–'}</div><div class="sub">${sl ? `to ${tf(sl.sleep.end)} · ${fmtH(sl.sleep.asleep)}` : 'No sleep recorded'}</div></div>`;
  const glance = `<div class="grid2 tight">
    <div class="card gl" data-go="activity">${ib('strain')}<div class="vl">${today ? "Today's strain" : 'Strain'}</div><div class="gv">${t?.strain != null ? t.strain.toFixed(1) : '–'}<small> / ${a.targetStrain ? a.targetStrain[1] : 21}</small></div>${targetBar(t?.strain, a.targetStrain)}</div>
    ${second}
  </div>`;
  const attn = today ? `<div class="card"><h3>Needs attention <small><button class="more" data-go="insights" style="padding:0;min-height:0">All insights ›</button></small></h3>${attention()}</div>` : '';
  return `<div class="stack"><p class="headline">${headline(rec, t, a)}</p>${waitCard(rec, t)}${setupCard()}${hero}${glance}<div class="vitals">${vitalTiles()}</div>${healthTile()}${attn}</div>`;
}

const LEVER_TIPS = {
  steps: 'Add a 15-minute walk after lunch and after dinner.',
  sleep: 'Protect a 7.5-hour sleep window; set a bedtime alarm.',
  regularity: 'Wake within 30 minutes of the same time every day, weekends included.',
  rhr: 'Zone 2 cardio 3 times a week lowers resting HR over 8-12 weeks.',
  vo2: 'Add one interval session a week (4 x 4 min hard) plus easy Zone 2.',
  activity: 'Add two brisk 25-minute sessions to reach the cardio zone.',
  strength: 'Two 30-minute full-body strength sessions a week.',
};

function paceGauge(p) {
  const pos = ((clamp(p, -1, 3) + 1) / 4) * 100;
  return `<div class="gauge" role="img" aria-label="Pace of aging ${p}x"><div class="gz young" style="left:0;width:50%"></div><div class="gz old" style="left:50%;width:50%"></div><div class="gm one" style="left:50%"></div><div class="gm you" style="left:${pos}%"></div></div><div class="scale"><span>-1x</span><span>0x</span><span>1x</span><span>2x</span><span>3x</span></div><div class="legend" style="margin-top:6px"><span><i class="sw lv-hi"></i>Aging slower</span><span><i class="sw lv-lo"></i>Aging faster</span></div>`;
}

function viewHealthspan() {
  const h = S.data.healthspan;
  const back = '<button class="more" data-go="today" style="padding:0 0 6px;align-self:flex-start">‹ Today</button>';
  if (!h || h.needsProfile) return `<div class="stack">${back}<div class="card"><h3>Pulse Age</h3><p style="margin:0 0 14px">Biological age compares your sleep, activity and heart fitness with research on longevity. It needs your age and sex.</p><button class="btn" id="setProfile">Add age and sex</button></div></div>`;
  if (h.needsData) return `<div class="stack">${back}<div class="card"><h3>Pulse Age</h3><p style="margin:0">Building your baseline: ${h.daysHave} of 14 days of data. Check back soon.</p></div></div>`;
  const diff = h.offset, word = diff <= -0.1 ? `${Math.abs(diff)} years younger than your age` : diff >= 0.1 ? `${diff} years older than your age` : 'in line with your age';
  const maxY = Math.max(3, ...h.metrics.map((m) => Math.abs(m.years)));
  const rows = h.metrics.map((m) => {
    const w = (Math.abs(m.years) / maxY) * 50;
    const younger = m.years < 0;
    return `<div class="hsrow"><div class="hsl"><b>${m.label}</b><span class="sub">${m.display} ${m.unit}</span></div>
      <div class="ax2"><i class="${younger ? 'lv-hi' : 'lv-lo'}" style="${younger ? `right:50%` : `left:50%`};width:${w}%"></i></div>
      <span class="chip ${m.status === 'good' ? 'good' : m.status === 'bad' ? 'bad' : ''}">${m.years > 0 ? '+' : ''}${m.years} y</span></div>`;
  }).join('');
  const levers = h.levers.length ? h.levers.map((l) => `<div class="lever"><div class="lv"><b>${l.label}</b><span class="chip good">−${l.gain} y</span></div><div class="sub">${l.display} → ${l.targetDisplay} ${l.unit}. ${LEVER_TIPS[l.key] || ''}</div></div>`).join('') : '<p class="sub" style="margin:0">You are at or near the reference level on everything tracked. Keep it up.</p>';
  const hist = h.history.length >= 3 ? `<div class="card"><h3>Pulse Age over time <small>30-day windows</small></h3>${C.line(h.history.map((x) => ({ date: x.date, v: x.bioAge })), (d) => d.v, { color: css('--rec-hi'), unit: ' yrs', dec: 1, fmt: (v) => v.toFixed(1) })}</div>` : '';
  return `<div class="stack">${back}
  <div class="grid2">
    <div class="card"><h3>Pulse Age <small>${h.provisional ? 'provisional · ' : ''}${h.daysHave} days of data</small></h3><div class="hsbig">${h.bioAge}<small> years</small></div><div class="sub" style="margin-top:6px">${word} (${h.age})</div></div>
    <div class="card"><h3>Pace of aging <small>last 30 days</small></h3><div class="hsbig">${h.pace}<small>x</small></div><div class="sub" style="margin:6px 0 14px">${paceWord(h.pace)}</div>${paceGauge(h.pace)}</div>
  </div>
  <div class="card"><h3>What's moving your age <small>years vs. a healthy reference</small></h3>${rows}<div class="scale" style="margin-top:8px"><span>Younger</span><span>Older</span></div></div>
  <div class="card"><h3>Biggest levers</h3>${levers}</div>
  ${hist}
  <details class="card"><summary>How this works</summary><div class="md" style="margin-top:12px">
    <p>Pulse Age follows the approach WHOOP describes for its Healthspan feature: each habit is mapped to published all-cause mortality research, combined with a correction so overlapping habits are not double counted, and converted to years using the Gompertz law (mortality risk roughly doubles every 8 years). Age uses up to 6 months of data; Pace compares your last 30 days with that baseline.</p>
    <p><strong>Evidence used:</strong> steps (Saint-Maurice 2020, Paluch 2022), resting heart rate (Zhang 2016), VO₂ max (Kodama 2009, Mandsager 2018), sleep duration (Cappuccio 2010), sleep regularity (Windred 2024), strength training (Momma 2022), weekly activity minutes (Arem 2015).</p>
    ${h.missing.length ? `<p><strong>Not counted (no data):</strong> ${h.missing.map((k) => ({ steps: 'steps', sleep: 'sleep', regularity: 'sleep consistency', rhr: 'resting HR', vo2: 'VO₂ max (Fitbit reports it after GPS walks or runs)', activity: 'active zone minutes', strength: 'strength training' }[k])).join(', ')}.</p>` : ''}
    <p>This is a transparent wellness estimate, not WHOOP's proprietary model and not a medical test. Treat the direction and the levers as more useful than the exact number.</p></div></details></div>`;
}

function wkRow(w) {
  return `<div class="wk"><div class="ico">${esc((w.name || '?')[0].toUpperCase())}</div><div class="m"><b>${esc(w.name)}</b><span class="sub">${w.start ? new Date(w.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + tf(w.start) : ''}</span>${w.zones ? zoneBar(w.zones, 6) : ''}</div>
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
    <div class="card"><h3>${isToday() ? 'Tonight' : 'Tonight (from today)'} <small>sleep plan</small></h3><div class="big">${plan.bedtime}</div><div class="sub" style="margin:6px 0 14px">Bedtime for a ${plan.wake} wake-up</div>
      <div class="minibar"><span class="n">Need tonight</span><div class="meter"><i style="left:0;width:${Math.min(100, Math.round(plan.needMin / 6))}%;background:var(--sleep2)"></i></div><span class="v" style="width:auto;min-width:70px">${fmtH(plan.needMin)}</span></div>
      <div class="kv"><div><small>Base need</small><b>${fmtH(plan.baseMin)}</b></div><div><small>Debt (7d)</small><b>${fmtH(plan.debtMin)}</b></div><div><small>Avg bedtime</small><b>${A().avgBedtime ?? '–'}</b></div><div><small>Variability</small><b>±${A().bedtimeSd ?? '–'}m</b></div></div></div>
  </div>
  <div class="card"><h3>Night timeline <small>tap a block</small></h3>${C.hypnogram(n)}
    <div class="stagebar">${seg(n.deep || 0, 'st-deep')}${seg(n.rem || 0, 'st-rem')}${seg(n.light || 0, 'st-light')}${seg(awake, 'st-awake')}</div>
    <div class="legend" style="margin:0 0 6px"><span><i class="sw st-deep"></i>Deep</span><span><i class="sw st-rem"></i>REM</span><span><i class="sw st-light"></i>Light</span><span><i class="sw st-awake"></i>Awake</span></div>
    ${stageRow('Deep', n.deep || 0, 'st-deep', '13–23%')}${stageRow('REM', n.rem || 0, 'st-rem', '20–25%')}${stageRow('Light', n.light || 0, 'st-light', '45–55%')}</div>
  <div class="grid2"><div class="card"><h3>Sleep per night <small>hours by stage</small></h3>${C.sleepStack(win(), plan.baseMin)}</div>
    <div class="card"><h3>Bed & wake times <small>${S.range > 30 ? 'last 30 nights' : 'consistency'}</small></h3>${C.sleepWindow(win(Math.min(S.range, 30)), tz)}</div></div>
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
  const mini = (title, key, color, unit, dec) => `<div class="card"><h3>${title} <small>${statSmall(w, key, dec, unit)}</small></h3>${C.line(w, (d) => d[key], { color, band: true, unit: ' ' + unit, dec, fmt: (v) => round(v, dec) })}</div>`;
  return `<div class="stack">${rangeSeg()}
  <div class="grid2">
    <div class="card"><h3>Recovery <small>${rec.date}</small></h3><div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"><div style="width:160px">${C.ring({ value: rec.recovery, max: 100, color: recColor(rec.recovery), text: rec.recovery + '%', size: 160, label: 'Recovery' })}</div><div style="flex:1;min-width:180px"><div class="chip ${rec.recovery >= 67 ? 'good' : rec.recovery >= 34 ? 'warn' : 'bad'}">${recWord(rec.recovery)}</div><p class="sub" style="margin:10px 0 0">${a.targetStrain ? `Target strain <b style="color:var(--tx)">${a.targetStrain[0]}–${a.targetStrain[1]}</b> today.` : ''}</p></div></div></div>
    <div class="card"><h3>What's driving it <small>vs your 28-day baseline</small></h3>${rec.contrib.length ? rec.contrib.map(contribRow).join('') : '<p class="sub">No contributors yet.</p>'}</div>
  </div>
  <div class="card"><h3>Recovery score</h3>${recLegend()}${C.bars(w, (d) => d.recovery, { min: 0, max: 100, colorFn: recColor, patternFn: recPat, fmt: (v) => v + '% · ' + recWord(v), unit: '', label: 'recovery score', wide: true, ticks: 3 })}</div>
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
  ${zonesCard()}${stressCard()}<div class="card"><h3>Daily strain</h3>${C.bars(w, (d) => d.strain, { min: 0, max: 21, colorFn: strainCol, label: 'daily strain', fmt: (v) => v.toFixed(1), wide: true, ticks: 3 })}</div>
  <div class="grid2"><div class="card"><h3>Steps</h3>${C.bars(w, (d) => d.steps, { color: css('--strain2'), label: 'steps', fmt: (v) => Math.round(v).toLocaleString() })}</div><div class="card"><h3>Active zone minutes</h3>${C.bars(w, (d) => d.azm, { color: css('--strain'), label: 'active zone minutes' })}</div></div>
  <div class="card"><h3>Recent workouts <small>${wks.length}</small></h3>${wks.length ? wks.map(wkRow).join('') : '<p class="sub">No workouts in this period. Start one on your Fitbit Air and it will show up here.</p>'}</div></div>`;
}

function viewTrends() {
  const a = A(), w = win();
  const rows = a.weekly.map((r) => `<tr><td>${r.label}</td><td>${r.label === 'Sleep' ? fmtH(r.now) : r.now ?? '–'}${r.label === 'Recovery' && r.now != null ? '%' : ''}</td><td>${r.label === 'Sleep' ? fmtH(r.prev) : r.prev ?? '–'}</td><td>${delta(r.now, r.prev, { dec: r.label === 'Strain' ? 1 : 0, good: r.good, unit: r.label === 'Sleep' ? 'm' : '' })}</td></tr>`).join('');
  const sp = (key, color) => C.spark(w.map((d) => d[key]), color);
  const st = (label, key, color, unit, dec = 0) => { const v = nonNull(w.map((d) => d[key])); const avg = v.length ? round(C.mean(v), dec) : null; return `<div><small>${label}</small><b>${avg ?? '–'}<span class="sub" style="font-size:12px;font-weight:500"> ${unit}</span></b>${sp(key, color)}</div>`; };
  return `<div class="stack">${healthTile()}${rangeSeg()}
  <div class="card"><h3>Averages <small>last ${S.range} days</small></h3><div class="kv" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">${st('Recovery', 'recovery', css('--rec-hi'), '%')}${st('HRV', 'hrv', css('--rec-hi'), 'ms')}${st('Resting HR', 'rhr', css('--rec-lo'), 'bpm')}${st('Sleep score', 'sleepScore', css('--sleep'), '%')}${st('Strain', 'strain', css('--strain'), '', 1)}${st('Steps', 'steps', css('--strain2'), '')}</div></div>
  <div class="grid2"><div class="card"><h3>This week vs last <small>7-day averages</small></h3><table class="tbl"><thead><tr><th></th><th>This week</th><th>Last</th><th>Change</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card"><h3>Highlights</h3>${a.best ? `<div class="kv" style="grid-template-columns:1fr 1fr"><div><small>Best recovery</small><b style="color:var(--rec-hi)">${a.best.recovery}%</b><div class="sub" style="font-size:12px">${C.fmtDate(a.best.date)}</div></div><div><small>Lowest recovery</small><b style="color:var(--rec-lo)">${a.worst.recovery}%</b><div class="sub" style="font-size:12px">${C.fmtDate(a.worst.date)}</div></div></div>` : '<p class="sub">Highlights appear after a week of data.</p>'}
      <div class="kv" style="grid-template-columns:1fr 1fr"><div><small>Avg bedtime</small><b>${a.avgBedtime ?? '–'}</b></div><div><small>Bedtime variability</small><b>±${a.bedtimeSd ?? '–'}m</b></div></div></div></div>
  <div class="card"><h3>Recovery calendar <small>blue primed · yellow moderate · hatched low</small></h3>${C.heatmap(days(), (d) => d.recovery, recColor, (v) => v + '% · ' + recWord(v), recPat)}${recLegend()}</div>
  <div class="grid2"><div class="card"><h3>HRV <small>${statSmall(w, 'hrv', 0, 'ms')}</small></h3>${C.line(w, (d) => d.hrv, { color: css('--rec-hi'), band: true, unit: ' ms' })}</div><div class="card"><h3>Resting heart rate <small>${statSmall(w, 'rhr', 0, 'bpm')}</small></h3>${C.line(w, (d) => d.rhr, { color: css('--rec-lo'), band: true, unit: ' bpm' })}</div>
  <div class="card"><h3>Sleep duration</h3>${C.bars(w, (d) => (d.sleep?.asleep ? d.sleep.asleep / 60 : null), { color: css('--sleep'), ref: A().sleepPlan.baseMin / 60, refLabel: 'need', fmt: (v) => fmtH(v * 60), min: 0 })}</div><div class="card"><h3>Strain vs recovery</h3>${C.line(w, (d) => d.recovery, { color: css('--rec-hi'), unit: '% recovery', min: 0, max: 100 })}</div></div></div>`;
}

function viewInsights() {
  const items = S.data.insights;
  const list = `<div class="card"><h3>Insights for you <small>${items.length} active</small></h3>${items.length ? insightsList(items) : '<p class="sub">Insights appear once a few days of data have synced.</p>'}</div>`;
  if (!S.data.aiEnabled) {
    return `<div class="stack">${weeklyCard()}${list}<div class="card"><h3>AI coach <small>optional, free</small></h3><div class="md"><p>Add a free key from console.groq.com/keys as <code>GROQ_API_KEY</code> in Vercel and redeploy to get an AI morning briefing and a chat that answers questions using your real numbers.</p></div></div></div>`;
  }
  const chips = ['Why is my recovery what it is today?', 'Should I train hard today?', 'How can I improve my deep sleep?', 'Summarize my week', 'How can I lower my biological age?'];
  return `<div class="stack">${weeklyCard()}<div class="card"><h3>Morning briefing <button class="btn ghost" id="regen" style="padding:6px 12px;font-size:12px">Regenerate</button></h3><div class="md" id="brief">${S.brief ? md(S.brief) : '<div class="skeleton"></div><div class="skeleton" style="width:80%"></div>'}</div></div>
  ${list}
  <div class="card"><h3>Ask your coach</h3><div class="chat" id="chat">${S.chat.map((m) => `<div class="msg ${m.role === 'user' ? 'u' : 'a'}">${m.role === 'user' ? esc(m.content) : `<div class="md">${md(m.content)}</div>`}</div>`).join('') || '<p class="sub">Ask anything about your data.</p>'}</div>
  <div class="chips">${chips.map((c) => `<button data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <form class="ask" id="askform"><input id="q" placeholder="Ask about your sleep, recovery, training…" autocomplete="off"><button class="btn">Send</button></form></div></div>`;
}

const RENDER = { today: viewToday, sleep: viewSleep, recovery: viewRecovery, activity: viewActivity, trends: viewTrends, insights: viewInsights, healthspan: viewHealthspan };

// ---------- shell ----------
function renderNav() {
  $('nav').innerHTML = `<div class="brand"><svg viewBox="0 0 24 24"><path d="M2 12h4l2.5-7 4 14 3-9 1.5 2H22"/></svg>Pulse</div>` +
    ALL_VIEWS.map(([k, label]) => `<button data-view="${k}" class="${k === 'healthspan' ? 'desk' : ''}" ${k === S.view ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24">${ICON[k]}</svg><span>${label}</span></button>`).join('');
}

function render() {
  if (!S.data) return;
  const hour = new Date().getHours();
  $('title').textContent = S.view === 'today' ? (isToday() ? (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') : 'Day review') : ALL_VIEWS.find(([k]) => k === S.view)[1];
  renderBadge();
  renderNav();
  const dv = DAY_VIEWS.includes(S.view); $('datebar').innerHTML = dv ? dateBar() : ''; $('datebar').classList.toggle('hidden', !dv);
  $('view').innerHTML = RENDER[S.view]();
  if (S.view === 'insights') ensureBrief();
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
  const p = S.data.prefs, hs = S.data.healthspan || {};
  return `${zoomHtml()}
  <label>Baseline sleep need <span><input id="need" type="number" min="5" max="11" step="0.25" value="${p.sleepNeedHours}"> h</span></label>
  <label>Age (for Pulse Age) <span><input id="age" type="number" min="16" max="100" step="1" value="${p.age ?? hs.age ?? ''}" placeholder="–"></span></label>
  <label>Sex (for Pulse Age) <span><select id="sex"><option value="" ${!(p.sex || hs.sex) ? 'selected' : ''}>–</option><option value="male" ${(p.sex || hs.sex) === 'male' ? 'selected' : ''}>Male</option><option value="female" ${(p.sex || hs.sex) === 'female' ? 'selected' : ''}>Female</option></select></span></label>
  <div class="dh">${dataHealthHtml()}</div>
  ${notifHtml()}
  ${S.state?.connected ? '<form method="post" action="/api/disconnect" onsubmit="return confirm(\'Disconnect and delete stored Fitbit data?\')"><button class="btn red">Disconnect Fitbit</button></form>' : (S.state?.demoDeployment ? '' : '<a class="btn" href="/api/connect" style="text-align:center;text-decoration:none">Connect Fitbit</a>')}
  ${S.state?.demoDeployment ? '' : '<form method="post" action="/api/logout"><button class="btn ghost" style="width:100%">Sign out</button></form>'}`;
}

// ---- freshness: always show what is stored right away, then quietly check Google for anything newer ----
const sigOf = (d) => JSON.stringify(d.days.slice(-2).map((x) => [x.date, x.recovery, x.sleep?.asleep, x.steps, x.hrv, x.rhr, x.strain, x.stress]));

async function load(refresh, quiet) {
  if (S.loading) return;
  S.loading = true;
  const btn = $('refresh'); btn.classList.add('spin');
  if (S.data) { S.syncing = true; renderBadge(); }
  try {
    S.state = await (await fetch('/api/state')).json();
    const r = await fetch('/api/data' + (refresh ? '?refresh=1' : ''));
    const data = await r.json();
    if (data.error) { if (!quiet || !S.data) { $('banner').classList.remove('hidden'); $('banner').innerHTML = 'Error: ' + esc(data.error); } return; }
    const changed = !S.data || sigOf(data) !== sigOf(S.data);
    S.data = data;
    const b = $('banner');
    if (S.data.auth?.expired) {
      b.className = 'banner err';
      b.innerHTML = `<div><b>Pulse lost its connection to Google.</b><br><span class="sub">${days().length ? 'Your latest Fitbit data is from ' + fmtDay(days()[days().length - 1].date) + '. ' : ''}Everything already saved is still here. Reconnecting takes a few seconds.</span></div><a class="btn" href="/api/connect">Reconnect to Google</a>`;
    } else if (!S.state.connected && !S.state.demoDeployment) {
      b.className = 'banner';
      b.classList.remove('hidden');
      b.innerHTML = S.state.configured ? '<b>Demo mode.</b> Open Settings → Connect Fitbit to load your own data.' : `<b>Demo mode.</b> Set GOOGLE_CLIENT_ID/SECRET and DATABASE_URL to connect. Redirect URI: <code>${esc(S.state.redirectUri)}</code>`;
    } else b.classList.add('hidden');
    if (S.data.auth?.expired) b.classList.remove('hidden');
    if (changed || !quiet) render();
    if (!S.notifInit) { S.notifInit = true; notifInit().then(() => render()); }
    if (!S.firstDone) { S.firstDone = true; setTimeout(() => maybeRefresh('open'), 800); }
  } catch (e) {
    if (!S.data) { $('banner').classList.remove('hidden'); $('banner').innerHTML = 'Could not load your data. Check your connection and try again.'; }
  } finally {
    S.loading = false; S.syncing = false; btn.classList.remove('spin'); renderBadge();
  }
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const ex = e.target.closest('[data-explain]');
  if (ex) { e.stopPropagation(); openExplain(ex.dataset.explain); return; }
  const t = e.target.closest('[data-view],[data-go],[data-range],[data-q],[data-day],[data-act],#moreIns,#regen,#setProfile,#hideSetup,#openHealth,#ntfyTest,#ntfyCopy,#weeklyAi,#checkAgain');
  if (!t) return;
  if (t.id === 'checkAgain') { S.autoChecks = 0; maybeRefresh('manual'); return; }
  if (t.id === 'ntfyTest') { t.textContent = 'Sending…'; fetch('/api/notify', { method: 'POST' }).then((r) => r.json()).then((j) => { t.textContent = j.sent ? 'Sent. Check ntfy' : 'Could not send'; if (j.sent) { lsSet('pulse_ntfy_done', '1'); render(); } }).catch(() => { t.textContent = 'Could not send'; }); return; }
  if (t.id === 'ntfyCopy') { navigator.clipboard?.writeText(S.notify.topic).then(() => { t.textContent = 'Copied'; }).catch(() => {}); return; }
  if (t.id === 'weeklyAi') { ask('Write my weekly review: what went well, what to watch, and one focus for next week.'); return; }
  if (t.id === 'setProfile' || t.id === 'openHealth') { $('gear').click(); return; }
  if (t.id === 'hideSetup') { lsSet('pulse_setup_hidden', '1'); render(); return; }
  if (t.dataset.act) { const k = t.dataset.act; if (k === 'settings') $('gear').click(); else if (k === 'hint') $('homeHint')?.classList.toggle('hidden'); return; }
  if (t.dataset.day) { const n = days().length; S.sel = t.dataset.day === 'today' ? null : clamp(selIdx() + +t.dataset.day, 0, n - 1); if (S.sel === n - 1) S.sel = null; render(); return; }
  if (t.dataset.view || t.dataset.go) { S.view = t.dataset.view || t.dataset.go; location.hash = S.view; render(); window.scrollTo(0, 0); }
  else if (t.dataset.range) { S.range = +t.dataset.range; render(); }
  else if (t.dataset.q) ask(t.dataset.q);
  else if (t.id === 'moreIns') { S.allInsights = !S.allInsights; render(); }
  else if (t.id === 'regen') { S.brief = null; $('brief').innerHTML = '<div class="skeleton"></div><div class="skeleton" style="width:80%"></div>'; ensureBrief(true); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-go]')) e.target.click(); });
document.addEventListener('submit', (e) => { if (e.target.id === 'askform') { e.preventDefault(); const q = $('q').value.trim(); if (q) ask(q); } });
window.addEventListener('hashchange', () => { const v = ALIAS[location.hash.slice(1)] || location.hash.slice(1); if (RENDER[v] && v !== S.view) { S.view = v; render(); } });
$('refresh').onclick = () => load(true);
$('gear').onclick = () => { $('settings-body').innerHTML = settingsBody(); $('settings').showModal(); };
$('settings').addEventListener('change', async (e) => {
  const f = { need: 'sleepNeedHours', age: 'age', sex: 'sex' }[e.target.id];
  if (f && e.target.value !== '') { await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ [f]: f === 'sex' ? e.target.value : +e.target.value }) }); load(); }
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

// day navigation: swipe left/right on the page, or arrow keys
(function () {
  let sx = 0, sy = 0, st = 0;
  const step = (dir) => { if (!S.data || !DAY_VIEWS.includes(S.view)) return; const n = days().length; const i = clamp(selIdx() + dir, 0, n - 1); S.sel = i === n - 1 ? null : i; render(); };
  document.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st < 600 && Math.abs(dx) > 80 && Math.abs(dy) < 40 && !e.target.closest('dialog,input,svg')) step(dx > 0 ? -1 : 1);
  }, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.target.matches('input,select,textarea') || e.metaKey || e.ctrlKey) return; if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); });
})();

// ---- heart-rate zones + daytime stress (Activity tab) ----
const fmtMin = (m) => (m >= 60 ? fmtH(m) : Math.round(m) + ' min');
function zoneBar(z, h) {
  const tot = z.reduce((s, v) => s + v, 0) || 1;
  return `<div class="zbar" style="height:${h || 12}px">${z.map((m, i) => `<i class="z${i + 1}" style="width:${(m / tot) * 100}%" title="Zone ${i + 1}: ${Math.round(m)} min"></i>`).join('')}</div>`;
}
function zonesCard() {
  const d = last();
  if (!d?.hrz) return '';
  const names = ['Zone 1 · Light', 'Zone 2 · Moderate', 'Zone 3 · Aerobic', 'Zone 4 · Hard', 'Zone 5 · Max'], pct = ['50–60%', '60–70%', '70–80%', '80–90%', '90–100%'];
  const rows = d.hrz.map((m, i) => `<div class="zrow"><span class="sw z${i + 1}"></span><span class="zn">${names[i]}<small>${pct[i]} of max heart rate</small></span><b>${fmtMin(m)}</b></div>`).join('');
  return `<div class="card"><h3>Heart-rate zones <small>${isToday() ? 'today' : fmtDay(d.date)}</small></h3>${zoneBar(d.hrz, 16)}<div style="margin-top:12px">${rows}</div><div class="sub" style="margin-top:8px">Avg ${d.hrAvg ?? '–'} bpm · max ${d.hrMax ?? '–'} bpm${d.trimp != null ? ` · load ${d.trimp}` : ''}</div></div>`;
}
function stressCard() {
  const d = last();
  if (!d?.stressHours) return '';
  const word = d.stress >= 2 ? 'High' : d.stress >= 1 ? 'Moderate' : 'Low';
  const col = (v) => (v >= 2 ? css('--rec-lo') : v >= 1 ? css('--rec-mid') : css('--rec-hi'));
  return `<div class="card"><h3>Daytime stress ${ib('stress')}</h3><div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px"><span class="big">${d.stress.toFixed(1)}</span><span class="sub">of 3 · ${word}</span></div>${C.hourly(d.stressHours, { colorFn: col, patFn: (v) => (v >= 2 ? 'p-low' : null), label: 'daytime stress by hour' })}<div class="legend"><span><i class="sw lv-hi"></i>Low</span><span><i class="sw lv-mid"></i>Moderate</span><span><i class="sw lv-lo"></i>High</span></div><p class="sub" style="margin:8px 0 0">From your heart rate while sitting still, compared with your resting rate. Automatic, nothing to log.</p></div>`;
}

// ---- weekly review card (Insights tab) ----
function weeklyCard() {
  const w = S.data.weekly;
  if (!w) return '';
  const t = w.totals;
  const li = (items, cls) => items.map((x) => `<li class="${cls}">${esc(x)}</li>`).join('');
  return `<div class="card"><h3>Weekly review <small>${fmtDay(w.from)} – ${fmtDay(w.to)}</small></h3>
    <p class="wk-head">${esc(w.headline)}</p>
    <div class="kv" style="grid-template-columns:repeat(auto-fit,minmax(96px,1fr))"><div><small>Recovery</small><b>${t.recovery ?? '–'}%</b></div><div><small>Sleep</small><b>${fmtH(t.sleep)}</b></div><div><small>Strain</small><b>${t.strain ?? '–'}</b></div><div><small>Steps/day</small><b>${t.steps?.toLocaleString() ?? '–'}</b></div><div><small>Workouts</small><b>${t.workouts}</b></div></div>
    ${w.wins.length ? `<div class="dolabel">Went well</div><ul class="steps wl">${li(w.wins, 'win')}</ul>` : ''}
    ${w.watch.length ? `<div class="dolabel">Watch</div><ul class="steps wl">${li(w.watch, 'watch')}</ul>` : ''}
    ${w.best ? `<div class="sub" style="margin-top:10px">Best day ${fmtDay(w.best.date)} (${w.best.recovery}%) · toughest ${fmtDay(w.worst.date)} (${w.worst.recovery}%)</div>` : ''}
    ${w.focus ? `<div class="dolabel">Next week's focus</div><div class="wk-focus"><b>${esc(w.focus.title)}</b><ul class="steps">${w.focus.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${S.data.aiEnabled ? '<button class="btn ghost" id="weeklyAi" style="margin-top:12px">Write it up with AI</button>' : ''}</div>`;
}

// ---- notifications via ntfy (free app, no keys) ----
async function notifInit() {
  try { S.notify = await (await fetch('/api/notify')).json(); } catch { S.notify = { available: false }; }
}
const refreshSettings = () => { if ($('settings').open) $('settings-body').innerHTML = settingsBody(); };
function notifHtml() {
  const n = S.notify;
  if (S.state?.demoDeployment) return '';
  if (!n || !n.available) return '<div><div class="dolabel" style="margin-top:0">Notifications</div><p class="sub" style="margin:0">Available once Pulse is connected to a database.</p></div>';
  const done = lsGet('pulse_ntfy_done') === '1';
  return `<div><div class="dolabel" style="margin-top:0">Notifications ${done ? '· set up' : ''}</div>
    <p class="sub" style="margin:0 0 10px">A morning briefing, a bedtime reminder and a weekly review, delivered by the free ntfy app. No account needed.</p>
    <ol class="ntfy-steps"><li>Install <b>ntfy</b> from the App Store.</li>
    <li>Tap <a class="ntfy-link" href="${esc(n.subscribeUrl)}">Subscribe in ntfy</a>, or in the app tap + and enter this topic: <code class="topic">${esc(n.topic)}</code></li>
    <li>Tap the button below to send a test.</li></ol>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="ntfyTest">Send a test</button><button class="btn ghost" id="ntfyCopy">Copy topic</button></div>
    <p class="sub" style="margin:8px 0 0;font-size:12px">The topic is private, so keep it to yourself. Messages pass through ${esc(n.server.replace(/^https?:\/\//, ''))}; set NTFY_SERVER to use your own.</p></div>`;
}

// service worker: offline fallback
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// "latest X · avg Y" for chart headers
function statSmall(arr, key, dec, unit) {
  const v = nonNull(arr.map((d) => d[key]));
  if (!v.length) return unit;
  return `latest ${round(v[v.length - 1], dec)} · avg ${round(C.mean(v), dec)} ${unit}`;
}

// ---- display size: scales the whole interface (text, charts, icons); charts resize their own labels ----
const zoomPct = () => Math.round((window.UI_ZOOM || 1) * 100);
function applyTiny() { document.documentElement.classList.toggle('tiny', innerWidth / (window.UI_ZOOM || 1) < 340); }
function applyZoom(pct) {
  const z = Math.min(1.3, Math.max(0.85, pct / 100));
  window.UI_ZOOM = z;
  document.documentElement.style.setProperty('--zoom', z);
  lsSet('pulse_ui_zoom', String(z));
  applyTiny();
  const lab = document.getElementById('zoomVal'); if (lab) lab.textContent = Math.round(z * 100) + '%';
}
function zoomHtml() {
  const pct = zoomPct();
  return `<div><div class="dolabel" style="margin-top:0;display:flex;justify-content:space-between;align-items:center">Text and display size <button class="linkbtn" id="zoomReset" ${pct === 100 ? 'hidden' : ''}>Reset</button></div>
    <div class="zoomctl"><span class="zA sm">A</span><input type="range" id="zoom" min="85" max="130" step="5" value="${pct}" aria-label="Text and display size"><span class="zA lg">A</span><span id="zoomVal" class="zval">${pct}%</span></div>
    <p class="sub" style="margin:6px 0 0;font-size:12px">Makes text, charts and icons larger or smaller.</p></div>`;
}
document.addEventListener('input', (e) => { if (e.target.id === 'zoom') applyZoom(+e.target.value); });
document.addEventListener('change', (e) => { if (e.target.id === 'zoom') { const r = document.getElementById('zoomReset'); if (r) r.hidden = +e.target.value === 100; render(); } });
document.addEventListener('click', (e) => { if (e.target.id === 'zoomReset') { applyZoom(100); const sl = document.getElementById('zoom'); if (sl) sl.value = 100; e.target.hidden = true; render(); } });
applyTiny();
addEventListener('resize', applyTiny);

// ---- background refresh: when the app opens or returns to the foreground, and while waiting for today's data ----
const FRESH_MS = 5 * 60 * 1000;
function maybeRefresh(trigger) {
  if (!S.data || S.data.source === 'demo' || S.loading || document.hidden) return;
  if (S.data.auth?.expired && trigger !== 'manual') return;
  const age = Date.now() - new Date(S.data.fetchedAt).getTime();
  const force = trigger === 'manual';
  const stale = trigger !== 'tick' && age > FRESH_MS;
  const waiting = waitingForToday() && (S.autoChecks || 0) < 12 && Date.now() - (S.lastCheck || 0) > 90000;
  if (!(force || stale || waiting)) return;
  S.lastCheck = Date.now();
  if (waiting && !force && !stale) S.autoChecks = (S.autoChecks || 0) + 1;
  load(true, true);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeRefresh('visible'); });
addEventListener('online', () => maybeRefresh('visible'));
setInterval(() => { renderBadge(); maybeRefresh('tick'); }, 60000);
