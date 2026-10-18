// @ts-nocheck
// Healthspan: a transparent "Pulse Age" and "Pace of Aging", modeled on how WHOOP describes its own approach
// (nine contributors mapped to published all-cause-mortality hazard ratios, overlap-corrected, judged against
// expert reference values; Age from ~6 months of data, Pace = last 30 days vs that baseline).
//
// This is NOT WHOOP's proprietary model or a clinical measure. Hazard curves below are simplified fits to:
//  - Steps: Saint-Maurice 2020 JAMA; Paluch 2022 Lancet Public Health (benefit plateaus ~10-12k/day)
//  - Resting HR: Zhang 2016 CMAJ meta-analysis (~9% higher mortality per +10 bpm)
//  - VO2 max: Kodama 2009 JAMA (~13% lower mortality per +1 MET = 3.5 ml/kg/min); Mandsager 2018
//  - Sleep duration: Cappuccio 2010 Sleep (U-shaped; short <6h and long >9h worse)
//  - Sleep regularity: Windred 2024 Sleep (irregular timing predicts mortality beyond duration)
//  - Strength training: Momma 2022 BJSM (~10-20% lower mortality at 30-60+ min/week)
//  - Activity minutes: Arem 2015 JAMA Intern Med (150-300 min/week of moderate-vigorous activity)
// Mortality-to-age conversion uses the Gompertz law (mortality risk doubles roughly every 8 years), with a 0.6
// shrink factor so overlapping habits are not double counted. Years are capped at +/-15.
import { hm, bedMinutes } from './scores';

const K = 0.6 / (Math.LN2 / 8); // years per unit of ln(hazard ratio)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = (a) => { a = a.filter((v) => v != null && isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
const sd = (a) => { a = a.filter((v) => v != null && isFinite(v)); if (a.length < 5) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const round = (x, d = 1) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

function interp(tbl, x) {
  if (x <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) if (x <= tbl[i][0]) { const [x0, y0] = tbl[i - 1], [x1, y1] = tbl[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  return tbl[tbl.length - 1][1];
}
const HR = {
  steps: (v) => interp([[2000, 1.35], [4000, 1.1], [5000, 1.0], [7000, 0.78], [8000, 0.68], [10000, 0.58], [12000, 0.52], [16000, 0.52]], v),
  sleep: (v) => interp([[4, 1.35], [5, 1.2], [6, 1.07], [7, 1.0], [8, 1.0], [9, 1.1], [10, 1.25]], v),
  regularity: (v) => interp([[20, 0.9], [45, 0.95], [60, 1.0], [90, 1.1], [120, 1.2], [180, 1.3]], v),
  strength: (v) => interp([[0, 1.0], [30, 0.92], [60, 0.88], [120, 0.88], [180, 0.92]], v),
  activity: (v) => interp([[0, 1.15], [30, 1.07], [60, 1.0], [150, 0.88], [300, 0.82], [600, 0.8], [900, 0.85]], v),
  rhr: (v) => Math.exp(0.0086 * (v - 60)),
};
// average VO2 max by age/sex (ml/kg/min), rough ACSM-style norms; the reference is "good" = norm + 4
const vo2Norm = (age, sex) => (sex === 'female' ? 38 - 0.29 * (age - 20) : 46 - 0.38 * (age - 20));

const strengthRe = /weight|strength|resistance|lift|crossfit|calisthen/i;

function windowMetrics(days, age, sex) {
  const n = days.length;
  const stepsDays = days.filter((d) => d.steps != null);
  const nights = days.filter((d) => d.sleep?.asleep);
  const wkFactor = stepsDays.length ? 7 / stepsDays.length : null;
  const mids = nights.filter((d) => d.sleep.start && d.sleep.end).map((d) => (bedMinutes(d.sleep.start) + (hm(d.sleep.end) + 1440)) / 2);
  const vo2 = [...days].reverse().find((d) => d.vo2 != null)?.vo2 ?? null;
  const out = {
    steps: stepsDays.length >= 7 ? mean(stepsDays.map((d) => d.steps)) : null,
    sleep: nights.length >= 7 ? mean(nights.map((d) => d.sleep.asleep)) / 60 : null,
    regularity: mids.length >= 7 ? sd(mids) : null,
    rhr: days.filter((d) => d.rhr != null).length >= 7 ? mean(days.map((d) => d.rhr)) : null,
    strength: wkFactor ? days.reduce((s, d) => s + (d.workouts || []).filter((w) => strengthRe.test(w.type + ' ' + w.name)).reduce((t, w) => t + (w.min || 0), 0), 0) * wkFactor : null,
    activity: wkFactor && stepsDays.some((d) => d.azm != null) ? days.reduce((s, d) => s + (d.azm || 0), 0) * wkFactor : null,
    vo2,
  };
  return out;
}

// Contribution in years for each available metric (positive = older, negative = younger)
function contributions(m, age, sex) {
  const vref = vo2Norm(age, sex) + 4;
  const defs = [
    { key: 'steps', label: 'Daily steps', unit: '/day', ref: 8000, target: 10000, hr: HR.steps, fmt: (v) => Math.round(v).toLocaleString(), why: 'Benefit climbs to about 10,000 steps a day, then plateaus.' },
    { key: 'sleep', label: 'Sleep duration', unit: 'h', ref: 7.5, target: 7.5, hr: HR.sleep, fmt: (v) => v.toFixed(1), why: 'Mortality risk is lowest at 7-8 hours and rises on both sides.' },
    { key: 'regularity', label: 'Sleep consistency', unit: 'min swing', ref: 45, target: 30, hr: HR.regularity, fmt: (v) => Math.round(v), why: 'Irregular sleep timing predicts mortality beyond total hours.' },
    { key: 'rhr', label: 'Resting heart rate', unit: 'bpm', ref: 60, target: m.rhr == null ? 55 : Math.max(52, m.rhr - 6), hr: HR.rhr, fmt: (v) => Math.round(v), why: 'Each +10 bpm is linked to about 9% higher mortality.' },
    { key: 'vo2', label: 'Cardio fitness (VO₂ max)', unit: 'ml/kg/min', ref: vref, target: vref + 6, hr: (v) => Math.exp(-0.0355 * (v - vref)), fmt: (v) => round(v, 1), why: 'One of the strongest predictors of longevity; +3.5 is about 13% lower risk.' },
    { key: 'activity', label: 'Active zone minutes', unit: '/week', ref: 150, target: 250, hr: HR.activity, fmt: (v) => Math.round(v), why: '150-300 weekly minutes is linked to about 30% lower mortality.' },
    { key: 'strength', label: 'Strength training', unit: 'min/week', ref: 60, target: 60, hr: HR.strength, fmt: (v) => Math.round(v), why: '30-60 minutes a week is linked to 10-20% lower mortality.' },
  ];
  const years = (def, v) => K * Math.log(def.hr(v) / def.hr(def.ref));
  return defs.filter((d) => m[d.key] != null).map((d) => {
    const v = m[d.key], y = years(d, v), t = years(d, d.target);
    return { key: d.key, label: d.label, unit: d.unit, value: v, display: d.fmt(v), years: round(y), target: d.target, targetDisplay: d.fmt(d.target), gain: round(Math.max(0, y - t)), why: d.why, status: y <= -0.3 ? 'good' : y >= 0.3 ? 'bad' : 'ok' };
  });
}
const offsetOf = (list) => clamp(list.reduce((s, c) => s + c.years, 0), -15, 15);

export function healthspan(days, prefs) {
  const age = Number(prefs.age), sex = prefs.sex === 'female' ? 'female' : prefs.sex === 'male' ? 'male' : null;
  if (!(age >= 16 && age <= 100) || !sex) return { needsProfile: true };
  const withData = days.filter((d) => d.sleep || d.steps != null || d.rhr != null);
  if (withData.length < 14) return { needsData: true, daysHave: withData.length, age, sex };

  const longWin = days.slice(-180), recentWin = days.slice(-30);
  const longList = contributions(windowMetrics(longWin, age, sex), age, sex);
  const recentList = contributions(windowMetrics(recentWin, age, sex), age, sex);
  const offset = offsetOf(longList), recentOffset = offsetOf(recentList);
  const longDays = withData.length;
  const pace = clamp(1 + (recentOffset - offset), -1, 3);

  // weekly history of the 30-day-window offset
  const history = [];
  for (let back = 11 * 7; back >= 0; back -= 7) {
    const end = days.length - back;
    if (end < 30) continue;
    const w = days.slice(end - 30, end), l = contributions(windowMetrics(w, age, sex), age, sex);
    if (l.length >= 3) history.push({ date: days[end - 1].date, bioAge: round(age + offsetOf(l)) });
  }

  const metrics = [...longList].sort((a, b) => Math.abs(b.years) - Math.abs(a.years));
  const levers = [...longList].filter((c) => c.gain >= 0.2).sort((a, b) => b.gain - a.gain).slice(0, 3);
  const missing = ['steps', 'sleep', 'regularity', 'rhr', 'vo2', 'activity', 'strength'].filter((k) => !longList.some((c) => c.key === k));
  return {
    age, sex, bioAge: round(age + offset), offset: round(offset), recentOffset: round(recentOffset), pace: round(pace),
    provisional: longDays < 60, daysHave: longDays, metrics, levers, history, missing,
  };
}
