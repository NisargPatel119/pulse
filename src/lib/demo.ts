// @ts-nocheck
// Realistic synthetic data so the dashboard works before you connect your Fitbit Air.
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

function demoDays(n = 45) {
  const r = rng(42);
  const days = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let fatigue = 0;
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(now); day.setDate(day.getDate() - i);
    const date = day.toLocaleDateString('en-CA');
    const bedOffset = Math.round((r() - 0.5) * 90);
    const asleepTarget = 6.2 + r() * 2.2;
    const asleep = Math.round(asleepTarget * 60);
    const inBed = Math.round(asleep * (1.08 + r() * 0.08));
    const deep = Math.round(asleep * (0.1 + r() * 0.12));
    const rem = Math.round(asleep * (0.17 + r() * 0.08));
    const start = new Date(day); start.setHours(22, 45 + bedOffset, 0, 0); start.setDate(start.getDate() - 1);
    const end = new Date(start.getTime() + inBed * 60000);
    const steps = Math.round(4000 + r() * 11000);
    const azm = Math.round(r() * 60);
    const exMin = r() > 0.5 ? Math.round(20 + r() * 50) : 0;
    const hrv = 55 + (asleepTarget - 7) * 8 - fatigue * 3 + (r() - 0.5) * 8;
    const rhr = 56 - (asleepTarget - 7) * 1.2 + fatigue * 0.8 + (r() - 0.5) * 3;
    fatigue = Math.max(0, fatigue * 0.6 + (steps / 15000 + azm / 60 + exMin / 70) - 1);
    const ill = i < 2 && n > 30;
    const names = ['Run','Weights','Cycling','Walk','HIIT'];
    const wname = names[Math.floor(r() * names.length)];
    const wstart = new Date(day); wstart.setHours(7 + Math.floor(r() * 11), 0, 0, 0); // last two days: slightly off, to trigger insights
    days.push({
      date,
      sleep: { asleep, awake: inBed - asleep, inBed, deep, rem, light: asleep - deep - rem, latency: Math.round(8 + r() * 15), start: start.toISOString(), end: end.toISOString(), stages: demoStages(start, asleep, deep, rem, inBed, r) },
      hrv: Math.round((hrv - (ill ? 9 : 0)) * 10) / 10,
      rhr: Math.round((rhr + (ill ? 5 : 0)) * 10) / 10,
      spo2: Math.round((96 + r() * 2.2 - (ill ? 2 : 0)) * 10) / 10,
      resp: Math.round((14.5 + r() * 1.2 + (ill ? 1.4 : 0)) * 10) / 10,
      steps, azm, exMin,
      temp: Math.round(((r() - 0.5) * 0.6 + (ill ? 1 : 0)) * 100) / 100,
      vo2: i % 15 === 0 ? Math.round((44 + r() * 2) * 10) / 10 : undefined,
      workouts: exMin ? [{ name: wname, type: wname.toUpperCase(), start: wstart.toISOString(), min: exMin, kcal: Math.round(exMin * (6 + r() * 5)), avgHr: Math.round(120 + r() * 40), azm: Math.round(exMin * (0.5 + r() * 0.8)), km: wname === 'Run' || wname === 'Cycling' || wname === 'Walk' ? Math.round(exMin * (0.1 + r() * 0.1) * 100) / 100 : null }] : undefined,
    });
  }
  return days;
}

function demoStages(start, asleep, deep, rem, inBed, r) {
  const st = []; let t = start.getTime();
  const end = t + inBed * 60000;
  const cycle = ['LIGHT', 'DEEP', 'LIGHT', 'REM', 'AWAKE'];
  let k = 0;
  while (t < end) {
    const type = cycle[k++ % cycle.length];
    const len = (type === 'AWAKE' ? 3 : 15 + r() * 30) * 60000;
    const e = Math.min(end, t + len);
    st.push({ type, start: new Date(t).toISOString(), end: new Date(e).toISOString() });
    t = e;
  }
  return st;
}

export { demoDays };
