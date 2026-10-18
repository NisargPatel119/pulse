const $ = (id) => document.getElementById(id);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmtH = (m) => (m == null ? '-' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);
const mean = (a) => { a = a.filter((v) => v != null); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
const sd = (a) => { a = a.filter((v) => v != null); if (a.length < 3) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

const recColor = (r) => (r >= 67 ? css('--rec') : r >= 34 ? css('--warn') : css('--bad'));

function ring(label, value, max, color, sub, display) {
  const R = 60, C = 2 * Math.PI * R, f = value == null ? 0 : Math.min(1, value / max);
  return `<div class="ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${R}" fill="none" stroke="${css('--line')}" stroke-width="12"/>
  <circle cx="75" cy="75" r="${R}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 75 75)"/>
  <text x="75" y="84" text-anchor="middle" font-size="32" font-weight="700" fill="${css('--tx')}">${value == null ? '-' : display ?? Math.round(value)}</text></svg>
  <div class="lab">${label}</div><div class="sub">${sub || ''}</div></div>`;
}

// Generic line/bar chart in inline SVG.
function chart(days, key, { color, type = 'line', band = false, min, max, colorFn } = {}) {
  const W = 520, H = 170, p = { l: 30, r: 8, t: 8, b: 20 };
  const pts = days.map((d, i) => ({ i, v: d[key], d }));
  const vals = pts.map((p) => p.v).filter((v) => v != null);
  if (vals.length < 2) return '<p class="sub" style="color:var(--mut)">Not enough data yet.</p>';
  const lo = min ?? Math.floor(Math.min(...vals) * 0.95), hi = max ?? Math.ceil(Math.max(...vals) * 1.05);
  const x = (i) => p.l + (i / (days.length - 1)) * (W - p.l - p.r);
  const y = (v) => p.t + (1 - (v - lo) / (hi - lo || 1)) * (H - p.t - p.b);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let k = 0; k <= 3; k++) {
    const v = lo + ((hi - lo) * k) / 3;
    s += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}" stroke="${css('--line')}"/><text x="${p.l - 4}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="${css('--mut')}">${Math.round(v)}</text>`;
  }
  if (band) {
    const m = mean(vals), s2 = sd(vals);
    s += `<rect x="${p.l}" width="${W - p.l - p.r}" y="${y(m + s2)}" height="${Math.max(0, y(m - s2) - y(m + s2))}" fill="${color}" opacity=".13"/>`;
  }
  if (type === 'bar') {
    const bw = Math.max(2, (W - p.l - p.r) / days.length - 3);
    for (const pt of pts) if (pt.v != null) s += `<rect x="${x(pt.i) - bw / 2}" y="${y(pt.v)}" width="${bw}" height="${y(lo) - y(pt.v)}" rx="2" fill="${colorFn ? colorFn(pt.v) : color}"/>`;
  } else {
    let d = '', started = false;
    for (const pt of pts) { if (pt.v == null) { started = false; continue; } d += `${started ? 'L' : 'M'}${x(pt.i)},${y(pt.v)}`; started = true; }
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`;
    const lp = [...pts].reverse().find((q) => q.v != null);
    s += `<circle cx="${x(lp.i)}" cy="${y(lp.v)}" r="4" fill="${color}"/>`;
  }
  const step = Math.ceil(days.length / 6);
  pts.forEach((pt) => { if (pt.i % step === 0) s += `<text x="${x(pt.i)}" y="${H - 5}" text-anchor="middle" font-size="10" fill="${css('--mut')}">${pt.d.date.slice(5)}</text>`; });
  return s + '</svg>';
}

function stackedSleep(days) {
  const W = 520, H = 170, p = { l: 30, r: 8, t: 8, b: 20 };
  const ds = days.map((d) => d.sleep).map((s) => s && s.deep != null ? s : null);
  if (ds.filter(Boolean).length < 2) return '<p style="color:var(--mut)">Stage data not available yet.</p>';
  const maxH = Math.max(9, ...ds.filter(Boolean).map((s) => (s.deep + s.rem + s.light) / 60));
  const bw = Math.max(2, (W - p.l - p.r) / days.length - 3);
  const y = (h) => p.t + (1 - h / maxH) * (H - p.t - p.b);
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  [0, 3, 6, 9].forEach((h) => { s += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(h)}" y2="${y(h)}" stroke="${css('--line')}"/><text x="${p.l - 4}" y="${y(h) + 4}" text-anchor="end" font-size="10" fill="${css('--mut')}">${h}</text>`; });
  ds.forEach((st, i) => {
    if (!st) return;
    const cx = p.l + (i / (days.length - 1)) * (W - p.l - p.r) - bw / 2;
    let acc = 0;
    [['deep', '--deep'], ['rem', '--remc'], ['light', '--light']].forEach(([k, c]) => {
      const h = st[k] / 60; s += `<rect x="${cx}" y="${y(acc + h)}" width="${bw}" height="${y(acc) - y(acc + h)}" fill="${css(c)}"/>`; acc += h;
    });
  });
  const need = +$('need').value || 8;
  s += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(need)}" y2="${y(need)}" stroke="${css('--tx')}" stroke-dasharray="4 4" opacity=".4"/>`;
  return s + `</svg><div class="legend"><span><i style="background:var(--deep)"></i>Deep</span><span><i style="background:var(--remc)"></i>REM</span><span><i style="background:var(--light)"></i>Light</span><span>- - sleep need</span></div>`;
}

function hypnogram(sl) {
  if (!sl?.stages?.length) return '';
  const t0 = new Date(sl.start).getTime(), t1 = new Date(sl.end).getTime();
  const rows = { AWAKE: 0, REM: 1, LIGHT: 2, DEEP: 3 }, cols = { AWAKE: '--awake', REM: '--remc', LIGHT: '--light', DEEP: '--deep' };
  const W = 520, H = 120;
  let s = `<svg viewBox="0 0 ${W} ${H}">`;
  Object.keys(rows).forEach((k) => (s += `<text x="0" y="${rows[k] * 26 + 20}" font-size="10" fill="${css('--mut')}">${k[0] + k.slice(1).toLowerCase()}</text>`));
  sl.stages.forEach((g) => {
    const r = rows[g.type]; if (r == null) return;
    const a = 46 + ((new Date(g.start) - t0) / (t1 - t0)) * (W - 50), b = 46 + ((new Date(g.end) - t0) / (t1 - t0)) * (W - 50);
    s += `<rect x="${a}" y="${r * 26 + 8}" width="${Math.max(1.5, b - a)}" height="16" rx="3" fill="${css(cols[g.type])}"/>`;
  });
  const tf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return s + `<text x="46" y="116" font-size="10" fill="${css('--mut')}">${tf(t0)}</text><text x="${W - 4}" y="116" text-anchor="end" font-size="10" fill="${css('--mut')}">${tf(t1)}</text></svg>`;
}

const LEVEL = { alert: '--bad', warn: '--warn', info: '--strain', good: '--rec' };

function render(data) {
  const days = data.days.slice(-30);
  const t = [...days].reverse().find((d) => d.recovery != null || d.sleep) || {};
  const rec = days.filter((d) => d.recovery != null).slice(-1)[0];
  const sl = days.filter((d) => d.sleepScore != null).slice(-1)[0];
  const today = days[days.length - 1];
  $('rings').innerHTML =
    ring('Recovery', rec?.recovery, 100, rec ? recColor(rec.recovery) : css('--line'), rec ? (rec.recovery >= 67 ? 'Ready to perform' : rec.recovery >= 34 ? 'Moderate' : 'Rest up') : 'Needs ~5 days of data', rec ? rec.recovery + '%' : null) +
    ring('Sleep', sl?.sleepScore, 100, css('--sleep'), sl ? fmtH(sl.sleep.asleep) + ' asleep' : 'No sleep yet', sl ? sl.sleepScore + '%' : null) +
    ring('Strain', today?.strain, 21, css('--strain'), today ? `${(today.steps || 0).toLocaleString()} steps · ${today.azm || 0} AZM` : '', today?.strain != null ? today.strain.toFixed(1) : null);

  $('insights').innerHTML = data.insights.length
    ? data.insights.map((i) => `<div class="ins"><div class="dot" style="background:var(${LEVEL[i.level]})"></div><div><b>${i.title}<span class="tag">${i.tag}</span></b><span>${i.body}</span></div></div>`).join('')
    : '<span style="color:var(--mut)">Insights appear once a few days of data have synced.</span>';

  const n = sl?.sleep;
  $('night').innerHTML = n ? `${hypnogram(n)}<div class="kv">
    <div><small>Asleep</small><b>${fmtH(n.asleep)}</b></div><div><small>Efficiency</small><b>${n.inBed ? Math.round((n.asleep / n.inBed) * 100) : '-'}%</b></div>
    <div><small>Deep</small><b>${fmtH(n.deep)}</b></div><div><small>REM</small><b>${fmtH(n.rem)}</b></div>
    <div><small>HRV</small><b>${sl.hrv ?? '-'} ms</b></div><div><small>Resting HR</small><b>${sl.rhr ?? '-'}</b></div>
    <div><small>SpO2</small><b>${sl.spo2 ?? '-'}%</b></div><div><small>Resp. rate</small><b>${sl.resp ?? '-'}</b></div></div>` : '<span style="color:var(--mut)">No sleep data yet.</span>';

  $('c-rec').innerHTML = chart(days, 'recovery', { type: 'bar', min: 0, max: 100, colorFn: recColor, color: css('--rec') });
  $('c-hrv').innerHTML = chart(days, 'hrv', { color: css('--rec'), band: true });
  $('c-rhr').innerHTML = chart(days, 'rhr', { color: css('--bad'), band: true });
  $('c-sleep').innerHTML = stackedSleep(days);
  $('c-strain').innerHTML = chart(days, 'strain', { type: 'bar', min: 0, max: 21, color: css('--strain') });

  $('badge').textContent = data.source === 'demo' ? 'Demo data' : 'Fitbit Air · synced ' + new Date(data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const st = data.status || {};
  $('diag').innerHTML = Object.keys(st).length
    ? `<p>${Object.entries(st).map(([k, v]) => `<b>${k}</b>: ${v.ok ? v.count + ' records' : '<span style="color:var(--bad)">' + v.error + '</span>'}`).join('<br>')}</p>
       <p style="color:var(--mut)">If a metric shows 0 records or fields look empty, open <code>/api/raw?p=/users/me/dataTypes/sleep/dataPoints?pageSize=1</code> to see the exact response and adjust lib/health.js.</p>
       <form method="post" action="/api/disconnect" onsubmit="return confirm('Disconnect and delete stored Fitbit data?')"><button>Disconnect Fitbit</button></form>`
    : '<p style="color:var(--mut)">Showing demo data. Connect your Fitbit to see yours.</p>';
}

async function load(refresh) {
  const state = await (await fetch('/api/state')).json();
  $('connect').style.display = state.connected || state.demoDeployment ? 'none' : '';
  $('signout').style.display = state.demoDeployment ? 'none' : '';
  const setup = $('setup');
  if (state.demoDeployment) setup.classList.add('hidden');
  else if (!state.connected) {
    setup.classList.remove('hidden');
    setup.innerHTML = state.configured
      ? '<b>Demo mode.</b> Click <b>Connect Fitbit</b> to sign in with Google and load your own data.'
      : `<b>Demo mode.</b> To connect your Fitbit Air, set GOOGLE_CLIENT_ID/SECRET and DATABASE_URL (see README). Redirect URI to register: <code>${state.redirectUri}</code>`;
  } else setup.classList.add('hidden');
  const r = await fetch('/api/data' + (refresh ? '?refresh=1' : ''));
  const data = await r.json();
  if (data.error) { setup.classList.remove('hidden'); setup.innerHTML = 'Error: ' + data.error; return; }
  $('need').value = data.prefs.sleepNeedHours;
  render(data);
}

$('refresh').onclick = () => load(true);
$('need').onchange = async () => {
  await fetch('/api/prefs', { method: 'POST', body: JSON.stringify({ sleepNeedHours: +$('need').value }) });
  load();
};
load();
