// @ts-nocheck
// Scoring (recovery / sleep / strain) and proactive insights. Pure functions over daily records.
// daily record: { date, sleep:{asleep,awake,inBed,deep,rem,light,latency,start,end}, rhr, hrv, spo2, resp, steps, azm, exMin }

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const nums = (a) => a.filter((v) => typeof v === 'number' && isFinite(v));
const mean = (a) => { a = nums(a); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
const sd = (a) => { a = nums(a); if (a.length < 3) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

function baseline(days, i, key, window = 28) {
  const prior = days.slice(Math.max(0, i - window), i).map((d) => d[key]);
  const v = nums(prior);
  if (v.length < 4) return null;
  return { mean: mean(v), sd: Math.max(sd(v) ?? 0, 1e-6), n: v.length };
}

function sleepScore(s, needMin) {
  if (!s || !s.asleep) return null;
  const dur = clamp(s.asleep / needMin, 0, 1);
  const eff = s.inBed ? clamp(s.asleep / s.inBed, 0, 1) : 0.85;
  const resto = s.deep != null && s.rem != null ? clamp((s.deep + s.rem) / s.asleep / 0.4, 0, 1) : 0.8;
  return round(100 * (0.6 * dur + 0.2 * clamp((eff - 0.7) / 0.25, 0, 1) + 0.2 * resto));
}

function strainScore(d) {
  const load = (d.steps || 0) / 1000 + (d.azm || 0) * 1.5 + (d.exMin || 0) * 0.5;
  return round(21 * (1 - Math.exp(-load / 45)), 1);
}

function recoveryScore(days, i, sleepPerf) {
  const d = days[i];
  const parts = [];
  const add = (key, dir, w) => {
    const b = baseline(days, i, key);
    if (b && d[key] != null) parts.push({ z: clamp(dir * (d[key] - b.mean) / b.sd, -3, 3), w });
  };
  add('hrv', 1, 0.5);
  add('rhr', -1, 0.25);
  add('resp', -1, 0.05);
  add('spo2', 1, 0.05);
  if (!parts.length) return null;
  if (sleepPerf != null) parts.push({ z: (sleepPerf - 75) / 15, w: 0.15 });
  const w = parts.reduce((s, p) => s + p.w, 0);
  const z = parts.reduce((s, p) => s + p.z * p.w, 0) / w;
  return clamp(round(60 + 20 * z), 1, 99);
}

function enrich(days, prefs) {
  const need = (prefs.sleepNeedHours || 8) * 60;
  days.forEach((d, i) => {
    d.sleepScore = sleepScore(d.sleep, need);
    d.recovery = recoveryScore(days, i, d.sleepScore);
    d.strain = strainScore(d);
  });
  return days;
}

function insights(days, prefs) {
  const out = [];
  const push = (level, title, body, tag) => out.push({ level, title, body, tag });
  const today = days[days.length - 1];
  if (!today) return out;
  const last = days.filter((d) => d.recovery != null).slice(-1)[0];
  const need = (prefs.sleepNeedHours || 8) * 60;
  const fmtH = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

  // Today's recommendation
  if (last) {
    const r = last.recovery;
    if (r >= 67) push('good', `Recovery ${r}% - green light`, 'Your body is primed. A good day to push hard: intervals, heavy lifts, or a long run. Target strain 14-18.', 'today');
    else if (r >= 34) push('info', `Recovery ${r}% - moderate`, 'Train at a steady effort and avoid maxing out. Target strain 8-13, and prioritize sleep tonight.', 'today');
    else push('warn', `Recovery ${r}% - take it easy`, 'Your markers say you are under-recovered. Favor walking, mobility or rest. Target strain under 8 and an early night.', 'today');
  }

  // Sleep debt (last 7 nights)
  const sl = days.slice(-7).filter((d) => d.sleep?.asleep);
  if (sl.length >= 4) {
    const debt = sl.reduce((s, d) => s + Math.max(0, need - d.sleep.asleep), 0);
    const avg = mean(sl.map((d) => d.sleep.asleep));
    if (debt > 180) push('warn', `Sleep debt: ${fmtH(debt)} this week`, `You average ${fmtH(avg)} vs a ${fmtH(need)} need. Try adding 30-45 min tonight; consistent catch-up beats one long sleep-in.`, 'sleep');
    else push('good', 'Sleep debt under control', `You average ${fmtH(avg)} over the last ${sl.length} nights (need ${fmtH(need)}).`, 'sleep');
  }

  // Bedtime consistency (minutes after noon so midnight doesn't wrap)
  const bt = days.slice(-10).map((d) => (d.sleep?.start ? bedMinutes(d.sleep.start) : null)).filter((v) => v != null);
  if (bt.length >= 5) {
    const s = sd(bt);
    if (s > 60) push('warn', 'Irregular bedtime', `Your bedtime varies by about ${Math.round(s)} minutes. A steadier schedule (within 30 min) usually boosts HRV and deep sleep.`, 'sleep');
    else if (s < 30) push('good', 'Consistent sleep schedule', `Bedtime varies only ~${Math.round(s)} min. Keep it up.`, 'sleep');
  }

  // Restorative sleep
  const l = [...days].reverse().find((d) => d.sleep?.deep != null && d.sleep.asleep);
  if (l) {
    const deepPct = (l.sleep.deep / l.sleep.asleep) * 100;
    const remPct = ((l.sleep.rem || 0) / l.sleep.asleep) * 100;
    if (deepPct < 10) push('info', `Low deep sleep (${Math.round(deepPct)}%)`, 'Deep sleep is typically 13-23%. Alcohol, late meals and warm bedrooms suppress it; a cool, dark room and earlier last meal help.', 'sleep');
    if (remPct < 15) push('info', `Low REM (${Math.round(remPct)}%)`, 'REM is usually 20-25%. Short nights cut REM most, since it concentrates in the last hours of sleep.', 'sleep');
  }

  // HRV trend
  const h7 = mean(days.slice(-7).map((d) => d.hrv));
  const hb = mean(days.slice(-35, -7).map((d) => d.hrv));
  if (h7 && hb) {
    const pct = ((h7 - hb) / hb) * 100;
    if (pct <= -10) push('warn', `HRV down ${Math.abs(Math.round(pct))}% vs your baseline`, 'A sustained HRV drop signals accumulated stress, poor sleep, illness onset or overtraining. Consider a lighter week.', 'trend');
    else if (pct >= 8) push('good', `HRV up ${Math.round(pct)}% vs baseline`, 'Your autonomic recovery is trending positively. Your current routine is working.', 'trend');
  }

  // Illness / overreach flag
  const t = days[days.length - 1];
  const rb = mean(days.slice(-28, -1).map((d) => d.rhr));
  const respB = mean(days.slice(-28, -1).map((d) => d.resp));
  if (t.rhr && rb) {
    const flags = [];
    if (t.rhr - rb >= 4) flags.push(`resting HR +${round(t.rhr - rb, 1)} bpm`);
    if (t.resp && respB && t.resp - respB >= 1) flags.push(`respiratory rate +${round(t.resp - respB, 1)}`);
    if (t.spo2 && t.spo2 < 93) flags.push(`SpO2 ${t.spo2}%`);
    if (flags.length >= 2 || (t.rhr - rb >= 7)) push('alert', 'Possible illness or heavy stress', `Multiple markers are off baseline (${flags.join(', ')}). Rest, hydrate and watch for symptoms. This is not a diagnosis; see a doctor if you feel unwell.`, 'health');
  }

  // SpO2
  const lowSp = days.slice(-7).filter((d) => d.spo2 && d.spo2 < 92);
  if (lowSp.length >= 2) push('alert', 'Repeated low blood oxygen', `SpO2 dipped below 92% on ${lowSp.length} of the last 7 nights. If this persists, mention it to a clinician (possible sleep-disordered breathing).`, 'health');

  // Activity consistency
  const st = days.slice(-7).filter((d) => d.steps != null);
  if (st.length >= 4) {
    const avg = mean(st.map((d) => d.steps));
    if (avg < 6000) push('info', `Low activity: ${Math.round(avg).toLocaleString()} steps/day`, 'Adding a 20-minute daily walk is one of the highest-return habits for HRV and resting HR.', 'activity');
  }

  // Strain vs recovery mismatch
  const y = days[days.length - 2];
  if (y && y.strain != null && t.recovery != null && y.strain >= 15 && t.recovery < 50)
    push('info', 'Yesterday was heavy', `Strain ${y.strain} left you at ${t.recovery}% recovery. Alternate hard and easy days to adapt rather than accumulate fatigue.`, 'activity');

  // Personal correlation: sleep vs next-day recovery
  const pairs = days.filter((d) => d.recovery != null && d.sleep?.asleep);
  if (pairs.length >= 14) {
    const long = pairs.filter((d) => d.sleep.asleep >= need * 0.95);
    const short = pairs.filter((d) => d.sleep.asleep < need * 0.85);
    if (long.length >= 4 && short.length >= 4) {
      const a = mean(long.map((d) => d.recovery)), b = mean(short.map((d) => d.recovery));
      if (a - b >= 8) push('info', 'Sleep is your recovery lever', `After full nights you average ${round(a)}% recovery vs ${round(b)}% after short ones, a ${round(a - b)}-point swing in your own data.`, 'pattern');
    }
  }

  // Sleep target tonight
  if (last && last.recovery < 50 || (sl.length && sl[sl.length - 1].sleep.asleep < need * 0.85))
    push('info', 'Tonight: aim for bed by ' + targetBed(days, need), 'Based on your usual wake time and sleep need, plus time to fall asleep.', 'sleep');

  const order = { alert: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => (a.tag === 'today' ? -1 : b.tag === 'today' ? 1 : order[a.level] - order[b.level]));
}

function bedMinutes(iso) {
  const d = new Date(iso);
  let m = d.getHours() * 60 + d.getMinutes();
  if (m < 12 * 60) m += 24 * 60;
  return m;
}

function targetBed(days, need) {
  const wakes = days.slice(-7).filter((d) => d.sleep?.end).map((d) => { const e = new Date(d.sleep.end); return e.getHours() * 60 + e.getMinutes(); });
  const wake = mean(wakes) ?? 7 * 60;
  const lat = mean(days.slice(-7).map((d) => d.sleep?.latency)) ?? 15;
  let bed = Math.round(wake - need - lat - 20);
  bed = ((bed % 1440) + 1440) % 1440;
  const h = Math.floor(bed / 60), m = bed % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export { enrich, insights, mean };
