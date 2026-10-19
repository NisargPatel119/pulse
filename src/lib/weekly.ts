// @ts-nocheck
// Weekly review: what changed this week vs last, wins, watch-outs, and one focus. Pure function over computed data.
const fmtH = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
const mean = (a) => { a = a.filter((v) => v != null && isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

export function weeklyReview(days, analytics, healthspan, insights) {
  const week = days.slice(-7);
  if (week.length < 5) return null;
  const show = (m, v) => (v == null ? '–' : m.label === 'Sleep' ? fmtH(v) : `${v}${m.label === 'Recovery' ? '%' : ''}`);

  const wins = [], watch = [];
  for (const m of analytics.weekly) {
    if (m.delta == null || m.prev == null || m.good === 0) continue;
    const rel = Math.abs(m.delta) / Math.max(1, Math.abs(m.prev));
    if (rel < 0.04) continue; // ignore noise
    const better = (m.delta > 0) === (m.good > 0);
    (better ? wins : watch).push(`${m.label} ${better ? 'improved' : 'slipped'}: ${show(m, m.prev)} → ${show(m, m.now)}`);
  }

  const withRec = week.filter((d) => d.recovery != null);
  const best = withRec.length ? [...withRec].sort((a, b) => b.recovery - a.recovery)[0] : null;
  const worst = withRec.length ? [...withRec].sort((a, b) => a.recovery - b.recovery)[0] : null;

  const totals = {
    recovery: round(mean(week.map((d) => d.recovery))),
    sleep: round(mean(week.map((d) => d.sleep?.asleep))),
    strain: round(mean(week.map((d) => d.strain)), 1),
    steps: round(mean(week.map((d) => d.steps))),
    workouts: week.reduce((s, d) => s + (d.workouts?.length || 0), 0),
    azm: week.reduce((s, d) => s + (d.azm || 0), 0),
  };

  // one focus for next week: the strongest actionable insight, else the biggest Pulse Age lever
  const act = insights.find((i) => i.tag !== 'today' && (i.level === 'alert' || i.level === 'warn') && i.steps?.length) || insights.find((i) => i.tag !== 'today' && i.steps?.length && i.level === 'info');
  const lever = healthspan?.levers?.[0];
  const focus = act ? { title: act.title, steps: act.steps.slice(0, 3) } : lever ? { title: `Raise ${lever.label.toLowerCase()}`, steps: [`${lever.display} → ${lever.targetDisplay} ${lever.unit} is worth about ${lever.gain} years on your Pulse Age.`] } : null;

  const headline = wins.length > watch.length + 1 ? 'A strong week: most of your numbers moved the right way.'
    : watch.length > wins.length + 1 ? 'A tougher week: several numbers slipped, so recovery is the priority.'
    : 'A steady week with a mix of ups and downs.';

  return { from: week[0].date, to: week[week.length - 1].date, headline, totals, wins: wins.slice(0, 4), watch: watch.slice(0, 4), best: best && { date: best.date, recovery: best.recovery }, worst: worst && { date: worst.date, recovery: worst.recovery }, focus, pulseAge: healthspan?.bioAge != null ? { bioAge: healthspan.bioAge, offset: healthspan.offset, pace: healthspan.pace } : null };
}
