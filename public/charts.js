// Tiny SVG chart kit (no dependencies). Every mark carries data-tip for the shared tooltip.
(function () {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const mean = (a) => { a = a.filter((v) => v != null && isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
  const sd = (a) => { a = a.filter((v) => v != null && isFinite(v)); if (a.length < 3) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const fmtDate = (s) => new Date(s + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const short = (s) => new Date(s + 'T12:00:00').toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  const esc = (s) => String(s).replace(/"/g, '&quot;');
  let uid = 0;

  function frame(days, vals, o) {
    const narrow = innerWidth < 700, W = o.wide && !narrow ? 1100 : 600, H = o.h || (o.wide && !narrow ? 190 : 170), p = { l: narrow ? 40 : 34, r: 10, t: 10, b: 26 };
    const v = vals.filter((x) => x != null && isFinite(x));
    let lo = o.min ?? Math.min(...v), hi = o.max ?? Math.max(...v);
    if (o.min == null) { const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad; if (lo < 0 && Math.min(...v) >= 0) lo = 0; }
    if (hi === lo) hi = lo + 1;
    const x = (i) => p.l + (days.length === 1 ? 0.5 : i / (days.length - 1)) * (W - p.l - p.r);
    const y = (val) => p.t + (1 - (val - lo) / (hi - lo)) * (H - p.t - p.b);
    let grid = '';
    for (let k = 0; k <= 3; k++) {
      const val = lo + ((hi - lo) * k) / 3;
      grid += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(val)}" y2="${y(val)}" stroke="${css('--line')}" stroke-width="1"/><text x="${p.l - 6}" y="${y(val) + 3.5}" text-anchor="end" class="ax">${o.fmtY ? o.fmtY(val) : Math.round(val * (o.dec ? 10 ** o.dec : 1)) / (o.dec ? 10 ** o.dec : 1)}</text>`;
    }
    const step = Math.max(1, Math.ceil(days.length / 6));
    let xl = '';
    days.forEach((d, i) => { if (i % step === 0 || i === days.length - 1 && (days.length - 1) % step > step / 2) xl += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="ax">${short(d.date)}</text>`; });
    return { W, H, p, lo, hi, x, y, grid, xl };
  }
  const empty = (msg = 'Not enough data yet') => `<div class="empty">${msg}</div>`;

  function line(days, get, o = {}) {
    const vals = days.map(get);
    if (vals.filter((v) => v != null).length < 2) return empty();
    const f = frame(days, vals, o), c = o.color || css('--accent');
    const id = 'g' + ++uid;
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(o.label || 'trend chart')}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>${f.grid}${f.xl}`;
    if (o.band) {
      const base = vals.filter((v) => v != null), m = mean(base), sdv = sd(base);
      s += `<rect x="${f.p.l}" width="${f.W - f.p.l - f.p.r}" y="${f.y(Math.min(f.hi, m + sdv))}" height="${Math.max(0, f.y(Math.max(f.lo, m - sdv)) - f.y(Math.min(f.hi, m + sdv)))}" fill="${c}" opacity=".10" rx="4"/><line x1="${f.p.l}" x2="${f.W - f.p.r}" y1="${f.y(m)}" y2="${f.y(m)}" stroke="${c}" stroke-dasharray="3 4" opacity=".5"/>`;
    }
    let d = '', started = false, first = null, lastI = null;
    vals.forEach((v, i) => { if (v == null) { started = false; return; } d += `${started ? 'L' : 'M'}${f.x(i).toFixed(1)},${f.y(v).toFixed(1)}`; started = true; if (first == null) first = i; lastI = i; });
    s += `<path d="${d} L${f.x(lastI)},${f.y(f.lo)} L${f.x(first)},${f.y(f.lo)}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (days.length <= 45) vals.forEach((v, i) => { if (v != null) s += `<circle cx="${f.x(i)}" cy="${f.y(v)}" r="${i === lastI ? 4.5 : 2.2}" fill="${i === lastI ? c : css('--card')}" stroke="${c}" stroke-width="1.6"/>`; });
    else s += `<circle cx="${f.x(lastI)}" cy="${f.y(vals[lastI])}" r="4.5" fill="${c}"/>`;
    const w = (f.W - f.p.l - f.p.r) / days.length;
    vals.forEach((v, i) => { if (v != null) s += `<rect class="hit" x="${f.x(i) - w / 2}" y="0" width="${w}" height="${f.H}" fill="transparent" data-tip="<b>${fmtDate(days[i].date)}</b><br>${o.fmt ? o.fmt(v) : v}${o.unit || ''}"/>`; });
    return s + '</svg>';
  }

  function bars(days, get, o = {}) {
    const vals = days.map(get);
    if (vals.filter((v) => v != null).length < 2) return empty();
    const f = frame(days, vals, { min: 0, ...o });
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(o.label || 'bar chart')}">${f.grid}${f.xl}`;
    const bw = Math.max(2, Math.min(22, ((f.W - f.p.l - f.p.r) / days.length) * 0.68));
    vals.forEach((v, i) => {
      if (v == null) return;
      const col = o.colorFn ? o.colorFn(v, days[i]) : o.color || css('--accent');
      const pat = o.patternFn ? o.patternFn(v, days[i]) : null;
      s += `<rect x="${f.x(i) - bw / 2}" y="${f.y(v)}" width="${bw}" height="${Math.max(1, f.y(f.lo) - f.y(v))}" rx="${Math.min(4, bw / 2)}" fill="${pat ? `url(#${pat})` : col}"/><rect class="hit" x="${f.x(i) - bw}" y="0" width="${bw * 2}" height="${f.H}" fill="transparent" data-tip="<b>${fmtDate(days[i].date)}</b><br>${o.fmt ? o.fmt(v, days[i]) : v}${o.unit || ''}"/>`;
    });
    if (o.ref != null) s += `<line x1="${f.p.l}" x2="${f.W - f.p.r}" y1="${f.y(o.ref)}" y2="${f.y(o.ref)}" stroke="${css('--tx')}" stroke-dasharray="4 4" opacity=".45"/><text x="${f.W - f.p.r}" y="${f.y(o.ref) - 4}" text-anchor="end" class="ax">${o.refLabel || ''}</text>`;
    if (o.band) s += `<rect x="${f.p.l}" width="${f.W - f.p.l - f.p.r}" y="${f.y(o.band[1])}" height="${f.y(o.band[0]) - f.y(o.band[1])}" fill="${css('--strain')}" opacity=".10"/>`;
    return s + '</svg>';
  }

  function sleepStack(days, needMin) {
    const ok = days.filter((d) => d.sleep?.deep != null);
    if (ok.length < 2) return empty('Sleep stage data not available yet');
    const tot = (d) => (d.sleep ? (d.sleep.deep || 0) + (d.sleep.rem || 0) + (d.sleep.light || 0) : null);
    const f = frame(days, days.map((d) => (tot(d) ? tot(d) / 60 : null)).concat([needMin / 60]), { min: 0, dec: 0 });
    const bw = Math.max(2, Math.min(22, ((f.W - f.p.l - f.p.r) / days.length) * 0.68));
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="sleep stages per night">${f.grid}${f.xl}`;
    days.forEach((d, i) => {
      if (!d.sleep || d.sleep.deep == null) return;
      let acc = 0;
      const st = [['Deep', 'deep', 'var(--deep)'], ['REM', 'rem', 'url(#p-rem)'], ['Light', 'light', 'var(--light)']];
      st.forEach(([name, k, col], j) => {
        const h = (d.sleep[k] || 0) / 60;
        s += `<rect x="${f.x(i) - bw / 2}" y="${f.y(acc + h)}" width="${bw}" height="${Math.max(0, f.y(acc) - f.y(acc + h))}" style="fill:${col}" rx="${j === 2 ? Math.min(4, bw / 2) : 0}"/>`;
        acc += h;
      });
      const hm = (m) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
      s += `<rect class="hit" x="${f.x(i) - bw}" y="0" width="${bw * 2}" height="${f.H}" fill="transparent" data-tip="<b>${fmtDate(d.date)}</b><br>Asleep ${hm(d.sleep.asleep)}<br>Deep ${hm(d.sleep.deep)} · REM ${hm(d.sleep.rem)}<br>Light ${hm(d.sleep.light)}"/>`;
    });
    s += `<line x1="${f.p.l}" x2="${f.W - f.p.r}" y1="${f.y(needMin / 60)}" y2="${f.y(needMin / 60)}" stroke="${css('--tx')}" stroke-dasharray="4 4" opacity=".45"/><text x="${f.W - f.p.r}" y="${f.y(needMin / 60) - 4}" text-anchor="end" class="ax">need</text></svg>`;
    return s + `<div class="legend"><span><i class="sw st-deep"></i>Deep</span><span><i class="sw st-rem"></i>REM</span><span><i class="sw st-light"></i>Light</span></div>`;
  }

  // Bed -> wake floating bars; values are minutes after noon for bed, minutes after midnight for wake
  function sleepWindow(days, tz) {
    const hm = (iso) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)); return (+p[0].value % 24) * 60 + +p[2].value; };
    const rows = days.map((d) => (d.sleep?.start && d.sleep?.end ? { d, bed: ((m) => (m < 720 ? m + 1440 : m))(hm(d.sleep.start)), wake: hm(d.sleep.end) + 1440 } : null));
    if (rows.filter(Boolean).length < 3) return empty();
    const lo = Math.floor(Math.min(...rows.filter(Boolean).map((r) => r.bed)) / 60 / 2) * 2 * 60 - 60, hi = Math.ceil(Math.max(...rows.filter(Boolean).map((r) => r.wake)) / 60 / 2) * 2 * 60 + 60;
    const W = 600, H = 170, p = { l: 44, r: 10, t: 8, b: 22 };
    const x = (i) => p.l + (days.length === 1 ? 0.5 : i / (days.length - 1)) * (W - p.l - p.r);
    const y = (m) => p.t + ((m - lo) / (hi - lo)) * (H - p.t - p.b);
    const lab = (m) => { const mm = m % 1440, h = Math.floor(mm / 60); return `${((h + 11) % 12) + 1}${h >= 12 ? 'p' : 'a'}`; };
    const bw = Math.max(2, Math.min(18, ((W - p.l - p.r) / days.length) * 0.6));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="bedtime and wake time">`;
    for (let m = Math.ceil(lo / 120) * 120; m <= hi; m += 120) s += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(m)}" y2="${y(m)}" stroke="${css('--line')}"/><text x="${p.l - 6}" y="${y(m) + 3.5}" text-anchor="end" class="ax">${lab(m)}</text>`;
    const step = Math.max(1, Math.ceil(days.length / 6));
    days.forEach((d, i) => { if (i % step === 0) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="ax">${short(d.date)}</text>`; });
    const t12 = (m) => { const mm = m % 1440, h = Math.floor(mm / 60); return `${((h + 11) % 12) + 1}:${String(mm % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
    rows.forEach((r, i) => { if (r) s += `<rect x="${x(i) - bw / 2}" y="${y(r.bed)}" width="${bw}" height="${Math.max(2, y(r.wake) - y(r.bed))}" rx="${Math.min(5, bw / 2)}" fill="${css('--sleep')}" opacity=".85"/><rect class="hit" x="${x(i) - bw}" y="0" width="${bw * 2}" height="${H}" fill="transparent" data-tip="<b>${fmtDate(r.d.date)}</b><br>Bed ${t12(r.bed)}<br>Wake ${t12(r.wake)}"/>`; });
    return s + '</svg>';
  }

  function hypnogram(sl) {
    if (!sl?.stages?.length) return empty('No stage timeline for this night');
    const t0 = new Date(sl.start).getTime(), t1 = new Date(sl.end).getTime();
    const rows = { AWAKE: 0, REM: 1, LIGHT: 2, DEEP: 3 }, cols = { AWAKE: 'url(#p-awake)', REM: 'url(#p-rem)', LIGHT: 'var(--light)', DEEP: 'var(--deep)' };
    const W = 600, H = 150, L = 50;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="sleep stage timeline">`;
    Object.keys(rows).forEach((k) => (s += `<line x1="${L}" x2="${W}" y1="${rows[k] * 30 + 20}" y2="${rows[k] * 30 + 20}" stroke="${css('--line')}"/><text x="0" y="${rows[k] * 30 + 24}" class="ax">${k[0] + k.slice(1).toLowerCase()}</text>`));
    const tf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    sl.stages.forEach((g) => {
      const r = rows[g.type]; if (r == null) return;
      const a = L + ((new Date(g.start) - t0) / (t1 - t0)) * (W - L), b = L + ((new Date(g.end) - t0) / (t1 - t0)) * (W - L);
      s += `<rect x="${a}" y="${r * 30 + 8}" width="${Math.max(2, b - a - 0.5)}" height="24" rx="4" style="fill:${cols[g.type]}" data-tip="<b>${g.type[0] + g.type.slice(1).toLowerCase()}</b><br>${tf(g.start)} – ${tf(g.end)}<br>${Math.round((new Date(g.end) - new Date(g.start)) / 60000)} min"/>`;
    });
    for (let k = 0; k <= 4; k++) { const t = t0 + ((t1 - t0) * k) / 4; s += `<text x="${L + ((W - L) * k) / 4}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" class="ax">${tf(t)}</text>`; }
    return s + '</svg>';
  }

  function ring(o) {
    const size = o.size || 170, R = size * 0.38, sw = size * 0.085, C = 2 * Math.PI * R, id = 'r' + ++uid;
    const f = o.value == null ? 0 : Math.min(1, o.value / o.max), c1 = o.color, c2 = o.color2 || o.color;
    return `<svg class="ringsvg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(o.label)} ${o.text ?? ''}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${R}" fill="none" stroke="${css('--line')}" stroke-width="${sw}"/>
      <circle class="arc" cx="${size / 2}" cy="${size / 2}" r="${R}" fill="none" stroke="url(#${id})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" transform="rotate(-90 ${size / 2} ${size / 2})" style="--c:${C};filter:drop-shadow(0 0 ${size * 0.04}px ${c1}66)"/>
      <text x="50%" y="${size * 0.54}" text-anchor="middle" class="rv" font-size="${size * 0.25}">${o.text ?? (o.value == null ? '–' : Math.round(o.value))}</text>
      ${o.unit ? `<text x="50%" y="${size * 0.68}" text-anchor="middle" class="ru" font-size="${size * 0.085}">${o.unit}</text>` : ''}</svg>`;
  }

  function heatmap(days, get, colorFn, fmt, patFn) {
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    const end = new Date(days[days.length - 1].date + 'T12:00:00'), start = new Date(days[0].date + 'T12:00:00');
    start.setDate(start.getDate() - start.getDay());
    const weeks = Math.ceil((end - start) / 864e5 / 7) + 1, c = 16, g = 4;
    let s = `<svg viewBox="0 0 ${weeks * (c + g) + 24} ${7 * (c + g) + 4}" role="img" aria-label="calendar heatmap">`;
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((l, r) => { if (r % 2) s += `<text x="0" y="${r * (c + g) + 12}" class="ax">${l}</text>`; });
    for (let w = 0; w < weeks; w++) for (let r = 0; r < 7; r++) {
      const dt = new Date(start); dt.setDate(dt.getDate() + w * 7 + r);
      if (dt > end) continue;
      const key = dt.toLocaleDateString('en-CA'), d = byDate[key], v = d ? get(d) : null;
      s += `<rect x="${24 + w * (c + g)}" y="${r * (c + g)}" width="${c}" height="${c}" rx="4" fill="${v == null ? css('--line') : patFn && patFn(v) ? `url(#${patFn(v)})` : colorFn(v)}" opacity="${v == null ? 0.5 : 1}" data-tip="<b>${fmtDate(key)}</b><br>${v == null ? 'No data' : fmt(v)}"/>`;
    }
    return s + '</svg>';
  }

  function spark(vals, color, w = 90, h = 28) {
    const v = vals.filter((x) => x != null);
    if (v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), n = vals.length;
    let d = '', st = false;
    vals.forEach((x, i) => { if (x == null) { st = false; return; } d += `${st ? 'L' : 'M'}${(i / (n - 1)) * w},${h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 4)}`; st = true; });
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  window.C = { line, bars, sleepStack, sleepWindow, hypnogram, ring, heatmap, spark, css, mean, sd, fmtDate };
})();
