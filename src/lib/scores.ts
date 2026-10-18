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
    ['Sleep duration', (p) => p.d.sleep?.asleep, 'longer sleep', 'shorter sleep'],
    ['Deep sleep', (p) => p.d.sleep?.deep, 'more deep sleep', 'less deep sleep'],
    ['Day strain', (p) => p.prev.strain, 'a harder day', 'an easier day'],
    ['Steps', (p) => p.prev.steps, 'more steps', 'fewer steps'],
    ['Bedtime', (p) => (p.d.sleep?.start ? bedMinutes(p.d.sleep.start) : null), 'a later bedtime', 'an earlier bedtime'],
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

// ---- proactive insights: analysis of YOUR data, each with practical steps ----
// Insight shape: { level, tag, title, why, steps[], body }  (body = why, kept for the AI coach context)

// n-of-1 comparison: split rows by predicate, compare an outcome between groups
function split(rows, pred, outcome, minEach = 4) {
  const a = [], b = [];
  for (const r of rows) { const o = outcome(r); if (o == null || !isFinite(o)) continue; (pred(r) ? a : b).push(o); }
  if (a.length < minEach || b.length < minEach) return null;
  return { yes: mean(a), no: mean(b), nYes: a.length, nNo: b.length, diff: mean(a) - mean(b) };
}
const med = (a) => { const s = nums(a).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const dow = (date) => new Date(date + 'T12:00:00').getDay();

function insights(days, prefs) {
  const out = [];
  const add = (level, tag, title, why, steps = []) => out.push({ level, tag, title, why, steps, body: why });
  const today = days[days.length - 1];
  if (!today) return out;
  const A = analytics(days, prefs);
  const base = (prefs.sleepNeedHours || 8) * 60;
  const plan = A.sleepPlan;
  const last = [...days].reverse().find((d) => d.recovery != null);
  const pairs = days.slice(1).map((d, i) => ({ prev: days[i], d })).filter((p) => p.d.recovery != null);
  const bedOf = (d) => (d.sleep?.start ? bedMinutes(d.sleep.start) : null); // night ending on day d
  const windDown = clock(parseClock(plan.bedtime) - 60);

  // 1. Today's plan, built from what is actually dragging recovery
  if (last) {
    const r = last.recovery, [lo, hi] = A.targetStrain;
    const bad = (last.contrib || []).filter((c) => c.status === 'bad').sort((a, b) => a.z - b.z);
    const good = (last.contrib || []).filter((c) => c.status === 'good');
    const steps = [];
    if (r >= 67) steps.push(`Hard session is fine today: aim for strain ${lo}-${hi} (intervals, heavy lifts or a long run).`, 'Eat enough carbs before and protein after so tomorrow is not a crash.');
    else if (r >= 34) steps.push(`Keep effort steady, strain ${lo}-${hi}: tempo, moderate lifting or Zone 2.`, 'Skip all-out efforts; save them for a green day.');
    else steps.push(`Keep strain under ${hi}: walking, mobility or full rest.`, 'Treat sleep as today\'s training: wind down at ' + windDown + '.');
    const fixes = { hrv: 'HRV is low: avoid max-effort work, and cut alcohol and late caffeine today.', rhr: 'Resting HR is elevated: drink extra water, avoid alcohol and heavy late meals, and take a short walk instead of hard cardio.', resp: 'Breathing rate is up: if you also feel run-down, rest; this often precedes illness.', spo2: 'Oxygen is lower than usual: try side-sleeping and clear nasal congestion before bed.', temp: 'Skin temperature is elevated: a common early sign of illness or a warm bedroom; cool the room and monitor symptoms.' };
    bad.slice(0, 2).forEach((c) => fixes[c.key] && steps.push(fixes[c.key]));
    if (last.sleepScore != null && last.sleepScore < 70) steps.push(`Last night scored ${last.sleepScore}%: a 20-minute nap before 3 PM can help, but keep it short so tonight is not affected.`);
    const why = `Recovery is ${r}%. ` + (bad.length ? `The biggest drags: ${bad.slice(0, 2).map((c) => `${c.label} ${round(c.value, c.dec)}${c.unit} vs your usual ${round(c.base, c.dec)}${c.unit}`).join(' and ')}.` : good.length ? `Working in your favor: ${good.slice(0, 2).map((c) => `${c.label} ${round(c.value, c.dec)}${c.unit} (usual ${round(c.base, c.dec)})`).join(', ')}.` : 'Your markers are close to your normal range.');
    add(r >= 67 ? 'good' : r >= 34 ? 'info' : 'warn', 'today', r >= 67 ? 'Green light: go hard today' : r >= 34 ? 'Moderate day: train steady' : 'Low recovery: ease off today', why, steps);
  }

  // 2. Sleep debt with pattern analysis
  const week = days.slice(-7).filter((d) => d.sleep?.asleep);
  if (week.length >= 4) {
    const avg = mean(week.map((d) => d.sleep.asleep));
    const short = week.filter((d) => d.sleep.asleep < base - 45);
    if (plan.debtMin > 120) {
      const worstDow = (() => { const g = {}; days.slice(-28).filter((d) => d.sleep?.asleep).forEach((d) => (g[dow(d.date)] ??= []).push(d.sleep.asleep)); const e = Object.entries(g).filter(([, v]) => v.length >= 2).map(([k, v]) => [+k, mean(v)]).sort((a, b) => a[1] - b[1]); return e[0]; })();
      const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
      add('warn', 'sleep', `You're ${fmtH(plan.debtMin)} short on sleep this week`,
        `You averaged ${fmtH(avg)} against a ${fmtH(base)} need, with ${short.length} of the last ${week.length} nights more than 45 minutes short.${worstDow ? ` Your shortest nights fall on ${names[worstDow[0]]} (avg ${fmtH(worstDow[1])}).` : ''} Sleep debt is paid back gradually, not in one night.`,
        [`Tonight: lights out by ${plan.bedtime} for ${fmtH(plan.needMin)} of sleep.`, `Start winding down at ${windDown}: dim lights, no work or doom-scrolling.`, 'Add 20-30 minutes per night for the next 3-4 nights rather than one big sleep-in.', worstDow ? `Protect ${names[worstDow[0]]}: set a bedtime alarm that day.` : 'Set a nightly bedtime alarm, not just a wake-up alarm.']);
    } else add('good', 'sleep', 'Sleep duration is on target', `You averaged ${fmtH(avg)} over ${week.length} nights against a ${fmtH(base)} need, with only ${fmtH(plan.debtMin)} of debt.`, ['Keep your current bedtime; consistency is what keeps this stable.']);
  }

  // 3. Bedtime -> next-day recovery (your own early vs late nights)
  const beds = pairs.map((p) => bedOf(p.d)).filter((v) => v != null);
  if (beds.length >= 12) {
    const cut = med(beds);
    const early = split(pairs, (p) => bedOf(p.d) != null && bedOf(p.d) <= cut, (p) => (bedOf(p.d) != null ? p.d.recovery : null));
    if (early && early.diff >= 5) {
      const hrvD = split(pairs, (p) => bedOf(p.d) != null && bedOf(p.d) <= cut, (p) => (bedOf(p.d) != null ? p.d.hrv : null));
      add('info', 'pattern', `Going to bed before ${clock(cut)} adds ${round(early.diff)} recovery points`,
        `After nights in bed by ${clock(cut)} your recovery averages ${round(early.yes)}%, vs ${round(early.no)}% after later nights (${early.nYes} vs ${early.nNo} nights)${hrvD ? `, and HRV is ${round(hrvD.diff, 1) > 0 ? '+' : ''}${round(hrvD.diff, 1)} ms` : ''}. This is from your own history.`,
        [`Make ${clock(cut)} your default bedtime on training days.`, `Phone on the charger outside the bed by ${windDown}.`, 'If you have a late night, keep your wake time the same and take a short early-afternoon nap.']);
    }
  }

  // 4. Weekday vs weekend schedule shift (social jet lag)
  const mids = days.slice(-28).filter((d) => d.sleep?.start && d.sleep?.end).map((d) => ({ d, mid: (bedMinutes(d.sleep.start) + (hm(d.sleep.end) + 1440)) / 2 }));
  const wkd = mids.filter((m) => ![0, 6].includes(dow(m.d.date))).map((m) => m.mid), wke = mids.filter((m) => [0, 6].includes(dow(m.d.date))).map((m) => m.mid);
  if (wkd.length >= 8 && wke.length >= 3) {
    const shift = mean(wke) - mean(wkd);
    if (shift >= 60) add('warn', 'sleep', `Weekend "social jet lag": ${Math.round(shift)} minutes`,
      `Your sleep midpoint shifts ${Math.round(shift)} minutes later on weekends, like flying across time zones every Friday. That shift makes Monday recovery and mood worse even if total hours are fine.`,
      ['Keep your wake time within 60 minutes of your weekday wake time, even after a late night.', 'Get 10 minutes of outdoor light within an hour of waking to re-anchor your clock.', 'If you need extra sleep, add it with a nap or an earlier Sunday bedtime, not a later wake-up.']);
  }

  // 5. Cost of a hard day
  const hard = split(pairs, (p) => p.prev.strain >= 14, (p) => p.d.hrv);
  if (hard && hard.diff <= -3) {
    add('info', 'pattern', `Hard days cost you ${Math.abs(round(hard.diff))} ms of HRV overnight`,
      `After days with strain 14+, your HRV averages ${round(hard.yes)} ms vs ${round(hard.no)} ms otherwise (${hard.nYes} hard days). Your body clearly needs that recovery window.`,
      ['Follow every strain 14+ day with an easy day (strain under 10).', 'Add 30 minutes of sleep on the night after a hard session.', 'Eat protein and carbs within 2 hours of your hardest workouts.']);
  }

  // 6. Late workouts and sleep
  const wk = pairs.filter((p) => p.prev.workouts?.length && p.d.sleep).map((p) => ({ d: p.d, late: p.prev.workouts.some((w) => w.start && hm(w.start) >= 19 * 60) }));
  if (wk.length >= 8) {
    const lat = split(wk, (r) => r.late, (r) => r.d.sleep.latency, 3);
    const deep = split(wk, (r) => r.late, (r) => (r.d.sleep.deep != null && r.d.sleep.asleep ? (r.d.sleep.deep / r.d.sleep.asleep) * 100 : null), 3);
    if ((lat && lat.diff >= 6) || (deep && deep.diff <= -3)) {
      add('info', 'pattern', 'Evening workouts are hurting your sleep',
        `On days you train after 7 PM you ${lat && lat.diff >= 6 ? `take ${round(lat.diff)} min longer to fall asleep (${round(lat.yes)} vs ${round(lat.no)})` : ''}${lat && lat.diff >= 6 && deep && deep.diff <= -3 ? ' and ' : ''}${deep && deep.diff <= -3 ? `get ${Math.abs(round(deep.diff, 1))} points less deep sleep (${round(deep.yes)}% vs ${round(deep.no)}%)` : ''}.`,
        ['Finish intense sessions at least 3 hours before bed; move hard workouts earlier when you can.', 'If evenings are your only time, keep them easier (Zone 2 or lifting) and cool down with a shower.', 'Lower your bedroom to about 65-68°F after a late workout.']);
    }
  }

  // 7. Daily movement -> next-day HRV
  const stepCut = med(days.map((d) => d.steps).filter((v) => v != null));
  if (stepCut) {
    const mv = split(pairs, (p) => p.prev.steps >= stepCut, (p) => p.d.hrv, 5);
    if (mv && mv.diff >= 2) add('info', 'pattern', `Active days lift your HRV by ${round(mv.diff, 1)} ms`,
      `After days with ${Math.round(stepCut).toLocaleString()}+ steps your HRV averages ${round(mv.yes)} ms vs ${round(mv.no)} ms on quieter days (${mv.nYes} vs ${mv.nNo} days).`,
      [`Use ${Math.round(stepCut).toLocaleString()} steps as your daily floor.`, 'Add a 10-minute walk after your two biggest meals.', 'On desk-heavy days, set an hourly 3-minute movement reminder.']);
  }

  // 8. Sleep efficiency
  const eff = days.slice(-7).filter((d) => d.sleep?.inBed && d.sleep.asleep);
  if (eff.length >= 4) {
    const e = mean(eff.map((d) => d.sleep.asleep / d.sleep.inBed)) * 100, awake = mean(eff.map((d) => d.sleep.inBed - d.sleep.asleep));
    if (e < 85) add('warn', 'sleep', `Sleep efficiency is ${Math.round(e)}% (target 85%+)`,
      `You spend about ${Math.round(awake)} minutes a night awake in bed. That usually means too much time in bed, a long time to fall asleep, or waking in the second half of the night.`,
      ['Only get into bed when sleepy; if awake for 20+ minutes, get up and read in dim light.', 'Keep a fixed wake time; it tightens your sleep window within a week.', 'Cut caffeine by noon and alcohol within 3 hours of bed; both fragment late-night sleep.']);
  }

  // 9. Time to fall asleep
  const lat7 = mean(days.slice(-7).map((d) => d.sleep?.latency));
  if (lat7 != null && lat7 >= 30) add('warn', 'sleep', `It takes you ${Math.round(lat7)} minutes to fall asleep`,
    'Over 30 minutes regularly points to being under-tired, wired, or on an inconsistent schedule.',
    [`Begin wind-down at ${windDown}: dim lights, warm shower, no screens or work email.`, 'Try a 4-7-8 breathing round or a 10-minute body scan in bed.', 'Avoid caffeine after noon and big meals within 3 hours of bed.', 'Get daylight and movement earlier in the day.']);

  // 10. Stage balance: deep and REM
  const stg = days.slice(-7).filter((d) => d.sleep?.deep != null && d.sleep.asleep);
  if (stg.length >= 4) {
    const deepPct = mean(stg.map((d) => (d.sleep.deep / d.sleep.asleep) * 100)), remPct = mean(stg.map((d) => ((d.sleep.rem || 0) / d.sleep.asleep) * 100));
    if (deepPct < 13) {
      const dd = split(pairs.filter((p) => p.d.sleep?.deep != null && p.d.sleep.asleep), (p) => (p.prev.exMin || 0) >= 20, (p) => (p.d.sleep.deep / p.d.sleep.asleep) * 100, 4);
      add('info', 'sleep', `Deep sleep is low: ${Math.round(deepPct)}% (typical 13-23%)`,
        `Deep sleep drives physical recovery and is the first stage squeezed by alcohol, heat and late eating.${dd && Math.abs(dd.diff) >= 1.5 ? ` In your data, nights after 20+ minute workouts have ${round(dd.diff, 1) > 0 ? 'more' : 'less'} deep sleep (${round(dd.yes)}% vs ${round(dd.no)}%).` : ''}`,
        ['Keep your bedroom around 65-68°F and fully dark.', 'Finish your last meal 3 hours before bed and skip alcohol on training days.', 'Strength training or a brisk daily walk increases deep sleep.']);
    }
    if (remPct < 15) add('info', 'sleep', `REM sleep is low: ${Math.round(remPct)}% (typical 20-25%)`,
      'REM piles up in the last third of the night, so short sleep or an early alarm cuts it first. Alcohol also suppresses it.',
      ['Protect the final 1-2 hours of sleep: avoid waking early to work out on late nights.', 'Skip alcohol within 4 hours of bed.', 'Keep a steady wake time so REM timing stabilizes.']);
  }

  // 11. Trends: HRV and resting HR
  const h7 = mean(days.slice(-7).map((d) => d.hrv)), hb = mean(days.slice(-35, -7).map((d) => d.hrv));
  if (h7 && hb) {
    const pct = ((h7 - hb) / hb) * 100;
    if (pct <= -10) {
      const sleepNow = mean(days.slice(-7).map((d) => d.sleep?.asleep)), sleepThen = mean(days.slice(-35, -7).map((d) => d.sleep?.asleep));
      const strainNow = mean(days.slice(-7).map((d) => d.strain)), strainThen = mean(days.slice(-35, -7).map((d) => d.strain));
      const causes = [];
      if (sleepNow && sleepThen && sleepNow < sleepThen - 20) causes.push(`sleep is down ${Math.round(sleepThen - sleepNow)} min/night`);
      if (strainNow && strainThen && strainNow > strainThen + 1) causes.push(`strain is up ${round(strainNow - strainThen, 1)}`);
      add('warn', 'trend', `HRV has dropped ${Math.abs(Math.round(pct))}% below your baseline`,
        `Your 7-day HRV is ${round(h7)} ms vs ${round(hb)} ms over the prior month. ${causes.length ? `Likely contributors in your data: ${causes.join(' and ')}.` : 'Nothing obvious in sleep or strain explains it, so consider stress, alcohol, illness or travel.'}`,
        ['Run a lighter week: cap strain at 12 for 3-4 days.', causes.some((c) => c.startsWith('sleep')) ? `Recover the lost sleep: bed by ${plan.bedtime} for the next few nights.` : 'Audit alcohol, caffeine and late meals this week.', 'Add 10 minutes of slow breathing (inhale 4s, exhale 6s) daily; it directly raises HRV.']);
    } else if (pct >= 8) add('good', 'trend', `HRV is up ${Math.round(pct)}% on your baseline`, `Your 7-day HRV is ${round(h7)} ms vs ${round(hb)} ms over the prior month: recovery capacity is improving.`, ['Keep your current sleep, training and alcohol habits stable.', 'This is a good window to add a little training load, about 5-10% more.']);
  }
  const rr7 = mean(days.slice(-7).map((d) => d.rhr)), rrb = mean(days.slice(-35, -7).map((d) => d.rhr));
  if (rr7 && rrb && rr7 - rrb >= 3) add('warn', 'trend', `Resting heart rate is up ${round(rr7 - rrb, 1)} bpm`, `Your 7-day resting HR is ${round(rr7, 1)} vs ${round(rrb, 1)} bpm over the prior month. A sustained rise usually means accumulated fatigue, dehydration, poor sleep or the start of an illness.`, ['Drink more water and cut alcohol for a few days.', 'Take two lighter training days.', 'If it stays elevated more than a week or you feel unwell, check in with a clinician.']);

  // 12. Illness / overreach flag
  const rb = mean(days.slice(-28, -1).map((d) => d.rhr)), respB = mean(days.slice(-28, -1).map((d) => d.resp));
  if (today.rhr && rb) {
    const flags = [];
    if (today.rhr - rb >= 4) flags.push(`resting HR +${round(today.rhr - rb, 1)} bpm`);
    if (today.resp && respB && today.resp - respB >= 1) flags.push(`breathing rate +${round(today.resp - respB, 1)}`);
    if (today.spo2 && today.spo2 < 93) flags.push(`SpO2 ${today.spo2}%`);
    if (today.temp != null && today.temp >= 0.8) flags.push(`skin temp +${round(today.temp, 1)}°C`);
    if (flags.length >= 2 || today.rhr - rb >= 7) add('alert', 'health', 'Several markers say your body is fighting something', `Off baseline together: ${flags.join(', ')}. This combination often shows up 1-2 days before symptoms, or after heavy stress or travel. This is not a diagnosis.`, ['Rest today: no hard training, extra fluids, early bedtime.', 'Skip alcohol and keep food simple.', 'Check your temperature if you feel off; see a doctor if symptoms develop or persist.']);
  }
  const lowSp = days.slice(-7).filter((d) => d.spo2 && d.spo2 < 92);
  if (lowSp.length >= 2) add('alert', 'health', `Blood oxygen dipped below 92% on ${lowSp.length} nights`, 'Repeated low overnight readings can reflect nasal congestion, sleeping position, altitude, or sleep-disordered breathing. Wrist sensors can also read low if the band is loose.', ['Check the band fits snugly, one finger-width above the wrist bone.', 'Try side-sleeping and a nasal strip or saline rinse for a few nights.', 'If it persists, ask a clinician about a sleep apnea screening.']);

  // 13. Activity volume
  const st = days.slice(-7).filter((d) => d.steps != null);
  if (st.length >= 4) {
    const avg = mean(st.map((d) => d.steps));
    if (avg < 7000) add('info', 'activity', `Daily movement is low: ${Math.round(avg).toLocaleString()} steps`, `Your 7-day average is ${Math.round(avg).toLocaleString()}. Moving from under 7,000 to 8,000+ steps meaningfully lowers resting HR and raises HRV over a few weeks.`, [`Add ${Math.min(2000, Math.round((8000 - avg) / 500) * 500)} steps a day this week: one 15-minute walk after lunch and one after dinner.`, 'Take phone calls on foot.', 'Raise the target by 500 steps each week.']);
  }
  if (A.weekTotals.azm >= 0 && st.length >= 4) {
    const gap = 150 - A.weekTotals.azm;
    if (gap > 0 && A.weekTotals.azm < 150) add('info', 'activity', `${A.weekTotals.azm} of 150 weekly active zone minutes`, `You need ${gap} more to hit the heart-health target. Time in the fat-burn zone counts once; cardio and peak zones count double.`, [`Two 20-minute brisk sessions add about ${Math.round(gap / 2)} each.`, 'Pick up the pace for the last 10 minutes of walks to reach the cardio zone.', 'Spread it across at least 3 days.']);
    else if (A.weekTotals.azm >= 150) add('good', 'activity', `Weekly active zone goal hit: ${A.weekTotals.azm}/150`, 'You have reached the heart-health target for the week.', ['Anything extra is a bonus; protect recovery before adding more.']);
  }

  // 14. Your recovery recipe: best quartile vs worst quartile of mornings
  if (pairs.length >= 28) {
    const sorted = [...pairs].sort((a, b) => b.d.recovery - a.d.recovery), q = Math.floor(sorted.length / 4);
    const top = sorted.slice(0, q), bot = sorted.slice(-q);
    const avgOf = (rows, f) => mean(rows.map(f));
    const lines = [];
    const bt = [avgOf(top, (p) => bedOf(p.d)), avgOf(bot, (p) => bedOf(p.d))];
    if (bt[0] != null && bt[1] != null && bt[1] - bt[0] >= 20) lines.push(`bedtime ${clock(bt[0])} vs ${clock(bt[1])}`);
    const sl2 = [avgOf(top, (p) => p.d.sleep?.asleep), avgOf(bot, (p) => p.d.sleep?.asleep)];
    if (sl2[0] && sl2[1] && sl2[0] - sl2[1] >= 20) lines.push(`sleep ${fmtH(sl2[0])} vs ${fmtH(sl2[1])}`);
    const sr = [avgOf(top, (p) => p.prev.strain), avgOf(bot, (p) => p.prev.strain)];
    if (sr[0] != null && sr[1] != null && Math.abs(sr[0] - sr[1]) >= 1) lines.push(`prior-day strain ${round(sr[0], 1)} vs ${round(sr[1], 1)}`);
    if (lines.length >= 2) add('info', 'pattern', 'Your recovery recipe', `Comparing your best 25% of mornings (recovery ${round(avgOf(top, (p) => p.d.recovery))}%) with your worst 25% (${round(avgOf(bot, (p) => p.d.recovery))}%), the night before differed in: ${lines.join('; ')} (best vs worst).`, ['Aim to repeat the "best" column on the nights before important days.', 'Track which factor you can change most easily and fix that one first.']);
  }

  const order = { alert: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => (a.tag === 'today' ? -1 : b.tag === 'today' ? 1 : order[a.level] - order[b.level]));
}

function parseClock(s) {
  const m = s.match(/(\d+):(\d+) (AM|PM)/);
  return ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2];
}

export { enrich, insights, analytics, mean };
