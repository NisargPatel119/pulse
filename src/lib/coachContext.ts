// Compact text snapshot of your data for the AI coach (last 14 days + baselines + analytics).
const f = (v: any, d = 0) => (v == null ? '-' : Number(v).toFixed(d));
const hm = (m: number | null) => (m == null ? '-' : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, '0')}`);

export function buildCoachContext(p: any) {
  const days = p.days.slice(-14);
  const a = p.analytics;
  const lines = [
    `Today's date: ${new Date().toISOString().slice(0, 10)}. Sleep need setting: ${p.prefs.sleepNeedHours}h. Source: ${p.source === 'demo' ? 'DEMO data' : 'Fitbit Air via Google Health API'}.`,
    '',
    'Last 14 days (date | recovery% | sleep score | asleep | deep min | REM min | HRV ms | resting HR | SpO2 | resp rate | skin temp dev C | strain 0-21 | steps | active zone min | workouts):',
    ...days.map((d: any) => [
      d.date, f(d.recovery), f(d.sleepScore), hm(d.sleep?.asleep ?? null), f(d.sleep?.deep), f(d.sleep?.rem), f(d.hrv), f(d.rhr), f(d.spo2, 1), f(d.resp, 1), f(d.temp, 2), f(d.strain, 1), f(d.steps), f(d.azm),
      (d.workouts || []).map((w: any) => `${w.name} ${w.min ?? '?'}min`).join('; ') || 'none',
    ].join(' | ')),
    '',
    `Sleep plan: need tonight ${hm(a.sleepPlan.needMin)} (base ${hm(a.sleepPlan.baseMin)}, weekly debt ${hm(a.sleepPlan.debtMin)}), suggested bedtime ${a.sleepPlan.bedtime}, usual wake ${a.sleepPlan.wake}.`,
    a.targetStrain ? `Target strain today: ${a.targetStrain[0]}-${a.targetStrain[1]}.` : '',
    a.drivers.length ? `Recovery drivers (correlation with next-day recovery): ${a.drivers.map((d: any) => `${d.label} r=${d.r}`).join(', ')}.` : '',
    'Week vs previous week: ' + a.weekly.map((w: any) => `${w.label} ${w.now ?? '-'} (${w.delta == null ? '-' : (w.delta > 0 ? '+' : '') + w.delta})`).join(', ') + '.',
    '',
    'Automatic insights already shown to the user:',
    ...p.insights.map((i: any) => `- [${i.level}] ${i.title}: ${i.body}`),
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}
