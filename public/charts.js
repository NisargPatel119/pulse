// Tiny SVG chart kit (no dependencies). Every mark carries data-tip for the shared tooltip.
//
// Readability rules baked in:
//  - the display-size setting (window.UI_ZOOM) shrinks the viewBox, so labels, lines and marks grow with it
//  - x labels are chosen by available width (never crowd); short ranges use weekday names
//  - more than 45 points: bar charts show weekly averages; line charts show a bold 7-day average over a faint daily line
//  - dots only on short ranges; value labels on top of bars only when there are few bars
(function () {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const mean = (a) => { a = a.filter((v) => v != null && isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
  const sd = (a) => { a = a.filter((v) => v != null && isFinite(v)); if (a.length < 3) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const dt = (s) => new Date(s + 'T12:00:00');
  const fmtDate = (s) => dt(s).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const monthDay = (s) => dt(s).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const numDay = (s) => dt(s).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  const wkday = (s) => dt(s).toLocaleDateString([], { weekday: 'short' });
  const esc = (s) => String(s).replace(/"/g, '&quot;');
  const compact = (v) => (v >= 10000 ? Math.round(v / 1000) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  const Z = () => window.UI_ZOOM || 1;
  const narrow = () => innerWidth / Z() < 700;
  let uid = 0;
  const empty = (msg = 'Not enough data yet') => `<div class="empty">${msg}</div>`;

  // more than 45 points are unreadable as bars: average them into weeks
  function weekly(days, vals) {
    if (days.length <= 45) return { days, vals, weekly: false };
    const od = [], ov = [];
    for (let i = 0; i < days.length; i += 7) { od.push(days[i]); ov.push(mean(vals.slice(i, i + 7))); }
    return { days: od, vals: ov, weekly: true };
  }

  // shared plot frame: scale, y grid, and width-aware x labels
  function frame(days, vals, o) {
    const nar = narrow(), z = Z();
    const baseW = o.wide && !nar ? 1100 : 600;
    const W = Math.round(baseW / z), H = o.h || 170;
    const p = { l: nar ? 42 : 38, r: 12, t: 14, b: 30 };
    const v = vals.filter((x) => x != null && isFinite(x));
    let lo = o.min ?? Math.min(...v), hi = o.max ?? Math.max(...v);
    if (o.min == null) { const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad; if (lo < 0 && Math.min(...v) >= 0) lo = 0; }
    if (hi === lo) hi = lo + 1;
    const n = days.length, plotW = W - p.l - p.r;
    const x = (i) => (o.center ? p.l + ((i + 0.5) / n) * plotW : p.l + (n === 1 ? 0.5 : i / (n - 1)) * plotW);
    const y = (val) => p.t + (1 - (val - lo) / (hi - lo)) * (H - p.t - p.b);
    const fmtY = o.fmtY || ((val) => compact(Math.round(val * (o.dec ? 10 ** o.dec : 1)) / (o.dec ? 10 ** o.dec : 1)));
    const ticks = o.ticks ?? 2;
    let grid = '';
    for (let k = 0; k <= ticks; k++) {
      const val = lo + ((hi - lo) * k) / ticks;
      grid += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(val)}" y2="${y(val)}" stroke="${css('--line')}" stroke-width="1"/><text x="${p.l - 8}" y="${y(val) + 4}" text-anchor="end" class="ax">${fmtY(val)}</text>`;
    }
    return { W, H, p, lo, hi, x, y, grid, plotW, n, center: !!o.center };
  }

  // (x labels are drawn by drawX so they can use the frame height)
  function drawX(f, days) {
    const nar = narrow(), n = days.length;
    if (!n) return '';
    const spanDays = n > 1 ? (dt(days[n - 1].date) - dt(days[0].date)) / 864e5 : 0;
    const fit = Math.max(2, Math.floor((f.W - f.p.l - f.p.r) / (nar ? 104 : 72)));
    const count = n <= 8 ? n : Math.min(fit, 6, n);
    const label = n <= 8 ? wkday : spanDays > 60 ? monthDay : numDay;
    const idx = new Set();
    for (let k = 0; k < count; k++) idx.add(count === 1 ? 0 : Math.round((k * (n - 1)) / (count - 1)));
    let s = '';
    idx.forEach((i) => { s += `<text x="${f.x(i)}" y="${f.H - 8}" text-anchor="${!f.center && i === 0 && n > 8 ? 'start' : !f.center && i === n - 1 && n > 8 ? 'end' : 'middle'}" class="ax">${label(days[i].date)}</text>`; });
    return s;
  }

  const legend = (items) => (items.length ? `<div class="legend">${items.join('')}</div>` : '');

  function line(days, get, o = {}) {
    const vals = days.map(get);
    if (vals.filter((v) => v != null).length < 2) return empty();
    const f = frame(days, vals, o), c = o.color || css('--accent'), n = days.length;
    const id = 'g' + ++uid;
    const nn = vals.filter((v) => v != null).length;
    const showDots = n <= 14 || nn <= 8, rolling = n >= 21 && nn >= 8; // sparse series (e.g. VO2 max) show plain dots
    const avg7 = rolling ? vals.map((_, i) => { const w = vals.slice(Math.max(0, i - 6), i + 1).filter((x) => x != null); return w.length >= 3 ? mean(w) : null; }) : null;
    const main = rolling ? avg7 : vals;
    const path = (arr) => { let d = '', st = false; arr.forEach((v, i) => { if (v == null) { st = false; return; } d += `${st ? 'L' : 'M'}${f.x(i).toFixed(1)},${f.y(v).toFixed(1)}`; st = true; }); return d; };
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(o.label || 'trend chart')}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>${f.grid}${drawX(f, days)}`;
    if (o.band) {
      const base = vals.filter((v) => v != null), m = mean(base), sdv = sd(base);
      s += `<rect x="${f.p.l}" width="${f.plotW}" y="${f.y(Math.min(f.hi, m + sdv))}" height="${Math.max(0, f.y(Math.max(f.lo, m - sdv)) - f.y(Math.min(f.hi, m + sdv)))}" fill="${c}" opacity=".12" rx="4"/>`;
    }
    let first = null, lastI = null;
    main.forEach((v, i) => { if (v != null) { if (first == null) first = i; lastI = i; } });
    const d = path(main);
    s += `<path d="${d} L${f.x(lastI)},${f.y(f.lo)} L${f.x(first)},${f.y(f.lo)}Z" fill="url(#${id})"/>`;
    if (rolling) s += `<path d="${path(vals)}" fill="none" stroke="${c}" stroke-width="1.3" opacity=".35" stroke-linejoin="round"/>`;
    s += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${rolling ? 3 : 2.6}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (showDots) vals.forEach((v, i) => { if (v != null && i !== lastI) s += `<circle cx="${f.x(i)}" cy="${f.y(v)}" r="3" fill="${css('--card')}" stroke="${c}" stroke-width="2"/>`; });
    s += `<circle cx="${f.x(lastI)}" cy="${f.y(main[lastI])}" r="5.5" fill="${c}" stroke="${css('--card')}" stroke-width="2"/>`;
    const w = f.plotW / n;
    vals.forEach((v, i) => {
      if (v == null) return;
      const extra = rolling && avg7[i] != null ? `<br>7-day avg ${o.fmt ? o.fmt(avg7[i]) : Math.round(avg7[i] * 10) / 10}${o.unit || ''}` : '';
      s += `<rect class="hit" x="${f.x(i) - w / 2}" y="0" width="${w}" height="${f.H}" fill="transparent" data-tip="<b>${fmtDate(days[i].date)}</b><br>${o.fmt ? o.fmt(v) : v}${o.unit || ''}${extra}"/>`;
    });
    const lg = [];
    if (o.band) lg.push('<span><i class="sw band"></i>Your normal range</span>');
    if (rolling) lg.push('<span><i class="sw avg"></i>Bold = 7-day average</span>');
    return s + '</svg>' + legend(lg);
  }

  function bars(days0, get, o = {}) {
    const raw = days0.map(get);
    if (raw.filter((v) => v != null).length < 2) return empty();
    const wk = o.weekly === false ? { days: days0, vals: raw, weekly: false } : weekly(days0, raw);
    const days = wk.days, vals = wk.vals, n = days.length;
    const f = frame(days, vals, { min: 0, center: true, ...o });
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(o.label || 'bar chart')}">${f.grid}${drawX(f, days)}`;
    if (o.band) s += `<rect x="${f.p.l}" width="${f.plotW}" y="${f.y(o.band[1])}" height="${f.y(o.band[0]) - f.y(o.band[1])}" fill="${css('--strain')}" opacity=".10"/>`;
    const slot = f.plotW / n, bw = Math.max(3, Math.min(30, slot * 0.62));
    const showVals = n <= 8;
    vals.forEach((v, i) => {
      if (v == null) return;
      const col = o.colorFn ? o.colorFn(v, days[i]) : o.color || css('--accent');
      const pat = o.patternFn ? o.patternFn(v, days[i]) : null;
      const cx = f.x(i), top = f.y(v);
      s += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, f.y(f.lo) - top)}" rx="${Math.min(5, bw / 2)}" fill="${pat ? `url(#${pat})` : col}"/>`;
      if (showVals) s += `<text x="${cx}" y="${Math.max(f.p.t + 10, top - 6)}" text-anchor="middle" class="ax" style="fill:var(--tx);font-weight:700">${o.short ? o.short(v) : compact(v)}</text>`;
      const tip = `<b>${wk.weekly ? 'Week of ' + monthDay(days[i].date) : fmtDate(days[i].date)}</b><br>${o.fmt ? o.fmt(v, days[i]) : compact(v)}${o.unit || ''}${wk.weekly ? '<br>weekly average' : ''}`;
      s += `<rect class="hit" x="${cx - slot / 2}" y="0" width="${slot}" height="${f.H}" fill="transparent" data-tip="${tip}"/>`;
    });
    if (o.ref != null) s += `<line x1="${f.p.l}" x2="${f.W - f.p.r}" y1="${f.y(o.ref)}" y2="${f.y(o.ref)}" stroke="${css('--tx')}" stroke-dasharray="5 5" opacity=".5"/><text x="${f.W - f.p.r}" y="${f.y(o.ref) - 6}" text-anchor="end" class="ax">${o.refLabel || ''}</text>`;
    return s + '</svg>' + legend(wk.weekly ? ['<span>Each bar is a weekly average</span>'] : []);
  }

  function sleepStack(days0, needMin) {
    if (days0.filter((d) => d.sleep?.deep != null).length < 2) return empty('Sleep stage data not available yet');
    let rows = days0.map((d) => ({ date: d.date, deep: d.sleep?.deep, rem: d.sleep?.rem, light: d.sleep?.light, asleep: d.sleep?.asleep }));
    let isWk = false;
    if (rows.length > 45) {
      isWk = true; const out = [];
      for (let i = 0; i < rows.length; i += 7) { const ch = rows.slice(i, i + 7); out.push({ date: ch[0].date, deep: mean(ch.map((r) => r.deep)), rem: mean(ch.map((r) => r.rem)), light: mean(ch.map((r) => r.light)), asleep: mean(ch.map((r) => r.asleep)) }); }
      rows = out;
    }
    const tot = (r) => (r.deep != null ? (r.deep + (r.rem || 0) + (r.light || 0)) / 60 : null);
    const f = frame(rows, rows.map(tot).concat([needMin / 60]), { min: 0, center: true, fmtY: (v) => Math.round(v) + 'h', ticks: 2 });
    const slot = f.plotW / rows.length, bw = Math.max(3, Math.min(30, slot * 0.62));
    const hm = (m) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
    let s = `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="sleep stages per night">${f.grid}${drawX(f, rows)}`;
    rows.forEach((r, i) => {
      if (r.deep == null) return;
      let acc = 0;
      [['deep', 'var(--deep)'], ['rem', 'url(#p-rem)'], ['light', 'var(--light)']].forEach(([k, fill], j) => {
        const h = (r[k] || 0) / 60;
        s += `<rect x="${f.x(i) - bw / 2}" y="${f.y(acc + h)}" width="${bw}" height="${Math.max(0, f.y(acc) - f.y(acc + h))}" style="fill:${fill}" rx="${j === 2 ? Math.min(5, bw / 2) : 0}"/>`;
        acc += h;
      });
      s += `<rect class="hit" x="${f.x(i) - slot / 2}" y="0" width="${slot}" height="${f.H}" fill="transparent" data-tip="<b>${isWk ? 'Week of ' + monthDay(r.date) : fmtDate(r.date)}</b><br>${isWk ? 'Avg asleep ' : 'Asleep '}${hm(r.asleep || 0)}<br>Deep ${hm(r.deep)} · REM ${hm(r.rem || 0)}<br>Light ${hm(r.light || 0)}"/>`;
    });
    s += `<line x1="${f.p.l}" x2="${f.W - f.p.r}" y1="${f.y(needMin / 60)}" y2="${f.y(needMin / 60)}" stroke="${css('--tx')}" stroke-dasharray="5 5" opacity=".5"/><text x="${f.W - f.p.r}" y="${f.y(needMin / 60) - 6}" text-anchor="end" class="ax">need</text></svg>`;
    return s + legend(['<span><i class="sw st-deep"></i>Deep</span>', '<span><i class="sw st-rem"></i>REM</span>', '<span><i class="sw st-light"></i>Light</span>', ...(isWk ? ['<span>Weekly averages</span>'] : [])]);
  }

  // bed -> wake floating bars (callers pass at most ~30 nights)
  function sleepWindow(days, tz) {
    const hm = (iso) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso)); return (+p[0].value % 24) * 60 + +p[2].value; };
    const rows = days.map((d) => (d.sleep?.start && d.sleep?.end ? { d, bed: ((m) => (m < 720 ? m + 1440 : m))(hm(d.sleep.start)), wake: hm(d.sleep.end) + 1440 } : null));
    if (rows.filter(Boolean).length < 3) return empty();
    const good = rows.filter(Boolean);
    const lo = Math.floor(Math.min(...good.map((r) => r.bed)) / 120) * 120 - 60, hi = Math.ceil(Math.max(...good.map((r) => r.wake)) / 120) * 120 + 60;
    const nar = narrow(), z = Z(), W = Math.round(600 / z), H = 180, p = { l: nar ? 50 : 44, r: 12, t: 12, b: 30 }, n = days.length;
    const plotW = W - p.l - p.r, x = (i) => p.l + ((i + 0.5) / n) * plotW, y = (m) => p.t + ((m - lo) / (hi - lo)) * (H - p.t - p.b);
    const lab = (m) => { const mm = m % 1440, h = Math.floor(mm / 60); return `${((h + 11) % 12) + 1}${h >= 12 ? 'pm' : 'am'}`; };
    const t12 = (m) => { const mm = m % 1440, h = Math.floor(mm / 60); return `${((h + 11) % 12) + 1}:${String(mm % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
    const bw = Math.max(4, Math.min(20, (plotW / n) * 0.6)), slot = plotW / n;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="bedtime and wake time">`;
    for (let m = Math.ceil(lo / 240) * 240; m <= hi; m += 240) s += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(m)}" y2="${y(m)}" stroke="${css('--line')}"/><text x="${p.l - 8}" y="${y(m) + 4}" text-anchor="end" class="ax">${lab(m)}</text>`;
    s += drawX({ W, H, p, x, center: true }, days);
    rows.forEach((r, i) => { if (r) s += `<rect x="${x(i) - bw / 2}" y="${y(r.bed)}" width="${bw}" height="${Math.max(3, y(r.wake) - y(r.bed))}" rx="${Math.min(5, bw / 2)}" fill="${css('--sleep')}" opacity=".9"/><rect class="hit" x="${x(i) - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-tip="<b>${fmtDate(r.d.date)}</b><br>Bed ${t12(r.bed)}<br>Wake ${t12(r.wake)}"/>`; });
    return s + '</svg>' + legend(['<span>Top of each bar = bedtime · bottom = wake time</span>']);
  }

  function hypnogram(sl) {
    if (!sl?.stages?.length) return empty('No stage timeline for this night');
    const t0 = new Date(sl.start).getTime(), t1 = new Date(sl.end).getTime();
    const rows = { AWAKE: 0, REM: 1, LIGHT: 2, DEEP: 3 }, cols = { AWAKE: 'url(#p-awake)', REM: 'url(#p-rem)', LIGHT: 'var(--light)', DEEP: 'var(--deep)' };
    const W = Math.round(600 / Z()), H = 160, L = narrow() ? 64 : 56;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="sleep stage timeline">`;
    Object.keys(rows).forEach((k) => (s += `<line x1="${L}" x2="${W}" y1="${rows[k] * 32 + 22}" y2="${rows[k] * 32 + 22}" stroke="${css('--line')}"/><text x="0" y="${rows[k] * 32 + 27}" class="ax">${k[0] + k.slice(1).toLowerCase()}</text>`));
    const tf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    sl.stages.forEach((g) => {
      const r = rows[g.type]; if (r == null) return;
      const a = L + ((new Date(g.start) - t0) / (t1 - t0)) * (W - L), b = L + ((new Date(g.end) - t0) / (t1 - t0)) * (W - L);
      s += `<rect x="${a}" y="${r * 32 + 8}" width="${Math.max(2, b - a - 0.5)}" height="26" rx="4" style="fill:${cols[g.type]}" data-tip="<b>${g.type[0] + g.type.slice(1).toLowerCase()}</b><br>${tf(g.start)} – ${tf(g.end)}<br>${Math.round((new Date(g.end) - new Date(g.start)) / 60000)} min"/>`;
    });
    const marks = narrow() || Z() > 1.1 ? [0, 2, 4] : [0, 1, 2, 3, 4];
    marks.forEach((k) => { const t = t0 + ((t1 - t0) * k) / 4; s += `<text x="${L + ((W - L) * k) / 4}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}" class="ax">${tf(t)}</text>`; });
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

  // calendar heatmap: month labels, and only as many weeks as fit comfortably
  function heatmap(days, get, colorFn, fmt, patFn) {
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    const end = dt(days[days.length - 1].date);
    const maxWeeks = narrow() ? 17 : 26;
    const start = dt(days[0].date);
    start.setDate(start.getDate() - start.getDay());
    let weeks = Math.ceil((end - start) / 864e5 / 7) + 1;
    if (weeks > maxWeeks) { start.setDate(start.getDate() + (weeks - maxWeeks) * 7); weeks = maxWeeks; }
    const c = 16, g = 4, top = 18;
    let s = `<svg viewBox="0 0 ${weeks * (c + g) + 24} ${7 * (c + g) + top}" role="img" aria-label="calendar heatmap">`;
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((l, r) => { if (r % 2) s += `<text x="0" y="${top + r * (c + g) + 13}" class="ax" style="font-size:11px">${l}</text>`; });
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const colStart = new Date(start); colStart.setDate(colStart.getDate() + w * 7);
      if (colStart.getMonth() !== lastMonth) { lastMonth = colStart.getMonth(); s += `<text x="${24 + w * (c + g)}" y="11" class="ax" style="font-size:11px">${colStart.toLocaleDateString([], { month: 'short' })}</text>`; }
      for (let r = 0; r < 7; r++) {
        const day = new Date(start); day.setDate(day.getDate() + w * 7 + r);
        if (day > end) continue;
        const key = day.toLocaleDateString('en-CA'), d = byDate[key], v = d ? get(d) : null;
        s += `<rect x="${24 + w * (c + g)}" y="${top + r * (c + g)}" width="${c}" height="${c}" rx="4" fill="${v == null ? css('--line') : patFn && patFn(v) ? `url(#${patFn(v)})` : colorFn(v)}" opacity="${v == null ? 0.5 : 1}" data-tip="<b>${fmtDate(key)}</b><br>${v == null ? 'No data' : fmt(v)}"/>`;
      }
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

  // 24 hourly bars (null = no data); vals on a 0-3 scale
  function hourly(vals, o = {}) {
    const W = Math.round(600 / Z()), H = 160, p = { l: 30, r: 8, t: 10, b: 28 }, slot = (W - p.l - p.r) / 24, bw = Math.max(4, slot - 4);
    const x = (h) => p.l + (h + 0.5) * slot, y = (v) => p.t + (1 - v / 3) * (H - p.t - p.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'hourly chart')}">`;
    [0, 1, 2, 3].forEach((v) => (s += `<line x1="${p.l}" x2="${W - p.r}" y1="${y(v)}" y2="${y(v)}" stroke="${css('--line')}"/><text x="${p.l - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${v}</text>`));
    [[6, '6a'], [12, '12p'], [18, '6p']].forEach(([h, l]) => (s += `<text x="${x(h)}" y="${H - 8}" text-anchor="middle" class="ax">${l}</text>`));
    const lab = (h) => `${((h + 11) % 12) + 1}${h >= 12 ? ' PM' : ' AM'}`;
    vals.forEach((v, h) => { if (v == null) return; s += `<rect x="${x(h) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(2, y(0) - y(v))}" rx="3" fill="${o.patFn && o.patFn(v) ? `url(#${o.patFn(v)})` : o.colorFn(v)}"/><rect class="hit" x="${x(h) - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-tip="<b>${lab(h)}</b><br>Stress ${v.toFixed(1)} of 3"/>`; });
    return s + '</svg>';
  }

  window.C = { hourly, line, bars, sleepStack, sleepWindow, hypnogram, ring, heatmap, spark, css, mean, sd, fmtDate };
})();
