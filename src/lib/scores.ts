// @ts-nocheck
// Scoring (recovery / sleep / strain), analytics and proactive insights over daily records.
// daily record: { date, sleep:{asleep,awake,inBed,deep,rem,light,latency,start,end,stages}, rhr, hrv, spo2, resp,
//                 temp, vo2, steps, azm, exMin, workouts:[{name,type,start,min,kcal,avgHr,azm,km}] }

const TZ = process.env.PULSE_TZ || 'America/New_York';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const nums = (a) => a.filter((v) => typeof v === 'number' && isFinite(v));
const mean = (a) => { a = nums(a); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
const sd = (a) => { a = nums(a); if (a.length < 3) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const fmtH = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

function hm(iso) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  return (+p.find((x) => x.type === 'hour').value % 24) * 60 + +p.find((x) => x.type === 'minute').value;
}
function bedMinutes(iso) { let m = hm(iso); if (m < 12 * 60) m += 24 * 60; return m; }
const clock = (min) => { min = ((Math.round(min) % 1440) + 1440) % 1440; const h = Math.floor(min / 60); return `${((h + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

function baseline(days, i, key, window = 28) {
  const v = nums(days.slice(Math.max(0, i - window), i).map((d) => d[key]));
  if (v.length < 4) return null;
  return { mean: mean(v), sd: Math.max(sd(v) ?? 0, 1e-6), n: v.length };
}

// ---- sleep ----
function sleepParts(days, i, needMin) {
  const s = days[i].sleep;
  if (!s || !s.asleep) return null;
  const dur = clamp(s.asleep / needMin, 0, 1);
  const eff = s.inBed ? clamp(s.asleep / s.inBed, 0, 1) : 0.88;
  const resto = s.deep != null && s.rem != null ? clamp((s.deep + s.rem) / s.asleep / 0.4, 0, 1) : null;
  // consistency: how close is this night's bedtime to the prior week's average
  const prior = days.slice(Math.max(0, i - 7), i).filter((d) => d.sleep?.start).map((d) => bedMinutes(d.sleep.start));
  const cons = prior.length >= 3 && s.start ? clamp(1 - Math.abs(bedMinutes(s.start) - mean(prior)) / 120, 0, 1) : null;
  return { duration: round(dur * 100), efficiency: round(clamp((eff - 0.7) / 0.25, 0, 1) * 100), restorative: resto == null ? null : round(resto * 100), consistency: cons == null ? null : round(cons * 100) };
}
function sleepScoreOf(p) {
  if (!p) return null;
  const w = [[p.duration, 0.5], [p.efficiency, 0.2], [p.restorative, 0.2], [p.consistency, 0.1]].filter(([v]) => v != null);
  const tw = w.reduce((s, [, x]) => s + x, 0);
  return round(w.reduce((s, [v, x]) => s + v * x, 0) / tw);
}

// ---- strain (0-21, logarithmic like Whoop: easy to rise early, hard to rise late) ----
function strainScore(d) {
  const wk = (d.workouts || []).reduce((s, w) => s + (w.azm || 0) * 1.5 + (w.min || 0) * 0.4, 0);
  const load = (d.steps || 0) / 1000 + (d.azm || 0) * 1.2 + (d.workouts?.length ? wk : (d.exMin || 0) * 0.5);
  return round(21 * (1 - Math.exp(-load / 45)), 1);
}

// ---- recovery ----
const CONTRIB = [
  { key: 'hrv', label: 'HRV', unit: 'ms', dir: 1, w: 0.5, dec: 0 },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', dir: -1, w: 0.25, dec: 0 },
  { key: 'resp', label: 'Respiratory rate', unit: 'rpm', dir: -1, w: 0.05, dec: 1 },
  { key: 'spo2', label: 'Blood oxygen', unit: '%', dir: 1, w: 0.05, dec: 1 },
  { key: 'temp', label: 'Skin temperature', unit: '°C', dir: 0, w: 0.05, dec: 2 },
];
function recoveryOf(days, i, sleepPerf) {
  const d = days[i];
  const items = [];
  for (const c of CONTRIB) {
    const b = baseline(days, i, c.key);
    if (!b || d[c.key] == null) continue;
    const raw = (d[c.key] - b.mean) / b.sd;
    const z = clamp(c.dir === 0 ? -Math.abs(raw) : c.dir * raw, -3, 3);
    items.push({ ...c, value: d[c.key], base: b.mean, sd: b.sd, delta: d[c.key] - b.mean, z, status: z >= 0.5 ? 'good' : z <= -1 ? 'bad' : 'ok' });
  }
  if (!items.length) return { score: null, items };
  const parts = items.map((x) => ({ z: x.z, w: x.w }));
  if (sleepPerf != null) parts.push({ z: (sleepPerf - 75) / 15, w: 0.15 });
  const w = parts.reduce((s, p) => s + p.w, 0);
  const z = parts.reduce((s, p) => s + p.z * p.w, 0) / w;
  return { score: clamp(round(60 + 20 * z), 1, 99), items };
}

function enrich(days, prefs) {
  const base = (prefs.sleepNeedHours || 8) * 60;
  days.forEach((d, i) => {
    d.sleepParts = sleepParts(days, i, base);
    d.sleepScore = sleepScoreOf(d.sleepParts);
    const r = recoveryOf(days, i, d.sleepScore);
    d.recovery = r.score;
    d.contrib = r.items;
    d.strain = strainScore(d);
  });
  return days;
}

// ---- analytics ----
function pearson(xs, ys) {
  const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x != null && y != null && isFinite(x) && isFinite(y));
  if (p.length < 12) return null;
  const mx = mean(p.map((a) => a[0])), my = mean(p.map((a) => a[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of p) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? { r: sxy / Math.sqrt(sxx * syy), n: p.length } : null;
}

function analytics(days, prefs) {
  const base = (prefs.sleepNeedHours || 8) * 60;
  const out = {};
  const last7 = days.slice(-7);

  // Dynamic sleep need: baseline + 1/4 of this week's debt + extra after a hard day
  const debt = last7.filter((d) => d.sleep?.asleep).reduce((s, d) => s + Math.max(0, base - d.sleep.asleep), 0);
  const today = days[days.length - 1];
  const strainAdj = today?.strain >= 14 ? 30 : today?.strain >= 10 ? 15 : 0;
  const need = clamp(Math.round(base + debt * 0.25 + strainAdj), base, base + 120);
  const wakes = last7.filter((d) => d.sleep?.end).map((d) => hm(d.sleep.end));
  const wake = wakes.length ? mean(wakes) : 7 * 60;
  const lat = mean(last7.map((d) => d.sleep?.latency)) ?? 15;
  out.sleepPlan = { baseMin: base, needMin: need, debtMin: Math.round(debt), strainAdjMin: strainAdj, bedtime: clock(wake - need - lat - 10), wake: clock(wake) };

  // Target strain from recovery
  const rec = [...days].reverse().find((d) => d.recovery != null);
  out.targetStrain = rec ? (rec.recovery >= 67 ? [14, 18] : rec.recovery >= 34 ? [8, 13] : [0, 8]) : null;

  // What moves your recovery (prior-day factor vs next-morning recovery)
  const pairs = days.slice(1).map((d, i) => ({ prev: days[i], d }));
  const factors = [
    ['Sleep duration', (p) => p.prev.sleep?.asleep, 'longer sleep', 'shorter sleep'],
    ['Deep sleep', (p) => p.prev.sleep?.deep, 'more deep sleep', 'less deep sleep'],
    ['Day strain', (p) => p.prev.strain, 'a harder day', 'an easier day'],
    ['Steps', (p) => p.prev.steps, 'more steps', 'fewer steps'],
    ['Bedtime', (p) => (p.prev.sleep?.start ? bedMinutes(p.prev.sleep.start) : null), 'a later bedtime', 'an earlier bedtime'],
    ['Workout minutes', (p) => p.prev.exMin ?? 0, 'longer workouts', 'shorter workouts'],
  ];
  out.drivers = factors.map(([label, f, up, down]) => {
    const c = pearson(pairs.map(f), pairs.map((p) => p.d.recovery));
    return c ? { label, r: round(c.r, 2), n: c.n, text: c.r >= 0 ? `${up} tends to raise next-day recovery` : `${up} tends to lower next-day recovery` } : null;
  }).filter(Boolean).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  // Weekly comparison
  const avg = (arr, f) => mean(arr.map(f));
  const prev7 = days.slice(-14, -7);
  const metrics = [
    ['Recovery', (d) => d.recovery, '%', 0, 1], ['HRV', (d) => d.hrv, 'ms', 0, 1], ['Resting HR', (d) => d.rhr, 'bpm', 1, -1],
    ['Sleep', (d) => d.sleep?.asleep, 'min', 0, 1], ['Strain', (d) => d.strain, '', 1, 0], ['Steps', (d) => d.steps, '', 0, 1], ['Active zone min', (d) => d.azm, '', 0, 1],
  ];
  out.weekly = metrics.map(([label, f, unit, dec, good]) => {
    const a = avg(last7, f), b = avg(prev7, f);
    return { label, unit, now: round(a, dec), prev: round(b, dec), delta: a != null && b != null ? round(a - b, dec) : null, good };
  });
  out.weekTotals = { workouts: last7.reduce((s, d) => s + (d.workouts?.length || 0), 0), azm: last7.reduce((s, d) => s + (d.azm || 0), 0) };

  // Highlights over the loaded range
  const withRec = days.filter((d) => d.recovery != null);
  if (withRec.length >= 7) {
    const best = [...withRec].sort((a, b) => b.recovery - a.recovery)[0], worst = [...withRec].sort((a, b) => a.recovery - b.recovery)[0];
    out.best = { date: best.date, recovery: best.recovery };
    out.worst = { date: worst.date, recovery: worst.recovery };
  }
  const bt = days.slice(-14).filter((d) => d.sleep?.start).map((d) => bedMinutes(d.sleep.start));
  out.bedtimeSd = bt.length >= 5 ? round(sd(bt)) : null;
  out.avgBedtime = bt.length >= 5 ? clock(mean(bt)) : null;
  return out;
}

// ---- proactive insights ----
function insights(days, prefs) {
  const out = [];
  const push = (level, title, body, tag) => out.push({ level, title, body, tag });
  const today = days[days.length - 1];
  if (!today) return out;
  const A = analytics(days, prefs);
  const need = (prefs.sleepNeedHours || 8) * 60;
  const last = [...days].reverse().find((d) => d.recovery != null);

  if (last) {
    const r = last.recovery, [lo, hi] = A.targetStrain;
    if (r >= 67) push('good', `Recovery ${r}%: green light`, `Your body is primed. A good day for intervals, heavy lifts or a long run. Target strain ${lo}-${hi}.`, 'today');
    else if (r >= 34) push('info', `Recovery ${r}%: moderate`, `Train at a steady effort and avoid maxing out. Target strain ${lo}-${hi}, and protect your sleep tonight.`, 'today');
    else push('warn', `Recovery ${r}%: take it easy`, `Your markers say you're under-recovered. Favor walking, mobility or rest. Target strain under ${hi}.`, 'today');
    const worst = (last.contrib || []).filter((c) => c.status === 'bad').sort((a, b) => a.z - b.z)[0];
    if (worst) push('warn', `${worst.label} is the main drag on recovery`, `${worst.label} is ${round(worst.value, worst.dec)}${worst.unit} vs your usual ${round(worst.base, worst.dec)}${worst.unit}.`, 'recovery');
  }

  const sl = days.slice(-7).filter((d) => d.sleep?.asleep);
  if (sl.length >= 4) {
    const avg = mean(sl.map((d) => d.sleep.asleep));
    if (A.sleepPlan.debtMin > 180) push('warn', `Sleep debt: ${fmtH(A.sleepPlan.debtMin)} this week`, `You average ${fmtH(avg)} vs a ${fmtH(need)} need. Tonight, aim for ${fmtH(A.sleepPlan.needMin)} (bed by ${A.sleepPlan.bedtime}); steady catch-up beats one long sleep-in.`, 'sleep');
    else push('good', 'Sleep debt under control', `You average ${fmtH(avg)} over the last ${sl.length} nights (need ${fmtH(need)}).`, 'sleep');
  }
  if (A.bedtimeSd != null) {
    if (A.bedtimeSd > 60) push('warn', 'Irregular bedtime', `Your bedtime varies by about ${A.bedtimeSd} minutes (avg ${A.avgBedtime}). Keeping it within 30 minutes usually boosts HRV and deep sleep.`, 'sleep');
    else if (A.bedtimeSd < 30) push('good', 'Consistent sleep schedule', `Bedtime varies only ~${A.bedtimeSd} min around ${A.avgBedtime}. Keep it up.`, 'sleep');
  }
  const l = [...days].reverse().find((d) => d.sleep?.deep != null && d.sleep.asleep);
  if (l) {
    const deepPct = (l.sleep.deep / l.sleep.asleep) * 100, remPct = ((l.sleep.rem || 0) / l.sleep.asleep) * 100;
    if (deepPct < 10) push('info', `Low deep sleep (${Math.round(deepPct)}%)`, 'Deep sleep is typically 13-23%. Alcohol, late meals and a warm room suppress it; a cool, dark room and an earlier last meal help.', 'sleep');
    if (remPct < 15) push('info', `Low REM (${Math.round(remPct)}%)`, 'REM is usually 20-25% and concentrates in the last hours of sleep, so short nights cut it first.', 'sleep');
  }

  const h7 = mean(days.slice(-7).map((d) => d.hrv)), hb = mean(days.slice(-35, -7).map((d) => d.hrv));
  if (h7 && hb) {
    const pct = ((h7 - hb) / hb) * 100;
    if (pct <= -10) push('warn', `HRV down ${Math.abs(Math.round(pct))}% vs your baseline`, 'A sustained HRV drop signals accumulated stress, poor sleep, illness onset or overtraining. Consider a lighter week.', 'trend');
    else if (pct >= 8) push('good', `HRV up ${Math.round(pct)}% vs baseline`, 'Your autonomic recovery is trending up. Your current routine is working.', 'trend');
  }

  const rb = mean(days.slice(-28, -1).map((d) => d.rhr)), respB = mean(days.slice(-28, -1).map((d) => d.resp)), tempHi = today.temp != null && today.temp >= 0.8;
  if (today.rhr && rb) {
    const flags = [];
    if (today.rhr - rb >= 4) flags.push(`resting HR +${round(today.rhr - rb, 1)} bpm`);
    if (today.resp && respB && today.resp - respB >= 1) flags.push(`respiratory rate +${round(today.resp - respB, 1)}`);
    if (today.spo2 && today.spo2 < 93) flags.push(`SpO2 ${today.spo2}%`);
    if (tempHi) flags.push(`skin temp +${round(today.temp, 1)}°C`);
    if (flags.length >= 2 || today.rhr - rb >= 7) push('alert', 'Possible illness or heavy stress', `Multiple markers are off baseline (${flags.join(', ')}). Rest, hydrate and watch for symptoms. This is not a diagnosis; see a doctor if you feel unwell.`, 'health');
  }
  const lowSp = days.slice(-7).filter((d) => d.spo2 && d.spo2 < 92);
  if (lowSp.length >= 2) push('alert', 'Repeated low blood oxygen', `SpO2 dipped below 92% on ${lowSp.length} of the last 7 nights. If this persists, mention it to a clinician.`, 'health');

  const st = days.slice(-7).filter((d) => d.steps != null);
  if (st.length >= 4) {
    const avg = mean(st.map((d) => d.steps));
    if (avg < 6000) push('info', `Low activity: ${Math.round(avg).toLocaleString()} steps/day`, 'A 20-minute daily walk is one of the best-return habits for HRV and resting HR.', 'activity');
  }
  if (A.weekTotals.azm > 0) {
    const goal = 150;
    push(A.weekTotals.azm >= goal ? 'good' : 'info', `${A.weekTotals.azm} active zone minutes this week`, A.weekTotals.azm >= goal ? `You've hit the ${goal}-minute weekly target. Anything extra is a bonus.` : `${goal - A.weekTotals.azm} more to reach the ${goal}-minute weekly heart-health target.`, 'activity');
  }
  const y = days[days.length - 2];
  if (y && y.strain >= 15 && today.recovery != null && today.recovery < 50) push('info', 'Yesterday was heavy', `Strain ${y.strain} left you at ${today.recovery}% recovery. Alternate hard and easy days to adapt rather than accumulate fatigue.`, 'activity');

  const top = A.drivers[0];
  if (top && Math.abs(top.r) >= 0.3) push('info', `Your biggest recovery lever: ${top.label.toLowerCase()}`, `In your own data, ${top.text} (correlation ${top.r}, ${top.n} days).`, 'pattern');

  const order = { alert: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => (a.tag === 'today' ? -1 : b.tag === 'today' ? 1 : order[a.level] - order[b.level]));
}

export { enrich, insights, analytics, mean };
