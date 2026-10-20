// @ts-nocheck
// Builds the push notification text. Kept short: title shows the number, body shows the action.
import type { PushMessage } from './push';

const fmtH = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

export function morningMessage(p): PushMessage {
  const rec = [...p.days].reverse().find((d) => d.recovery != null);
  const a = p.analytics;
  const alert = p.insights.find((i) => i.level === 'alert');
  if (!rec) return { title: 'Good morning', body: 'Your Pulse briefing is ready.', url: '/#today', tag: 'sunrise' };
  const todayInTz = new Date().toLocaleDateString('en-CA', { timeZone: process.env.PULSE_TZ || 'America/New_York' });
  if (rec.date !== todayInTz) return { title: "Last night's sleep hasn't synced", body: 'Sync your Fitbit, then open Pulse for today\'s recovery.', url: '/#today', tag: 'hourglass_flowing_sand' };
  const r = rec.recovery, [lo, hi] = a.targetStrain || [0, 21];
  const word = r >= 67 ? 'Primed' : r >= 34 ? 'Moderate' : 'Take it easy';
  const plan = r >= 67 ? `Go hard today (strain ${lo}–${hi}).` : r >= 34 ? `Train steady (strain ${lo}–${hi}).` : `Keep it easy (strain under ${hi}).`;
  return { title: `Recovery ${r}% · ${word}`, body: alert ? `${plan} Heads up: ${alert.title}.` : `${plan} Bed by ${a.sleepPlan.bedtime} tonight.`, url: '/#today', tag: 'sunrise' };
}

export function eveningMessage(p): PushMessage {
  const plan = p.analytics.sleepPlan;
  return { title: 'Time to wind down', body: `Aim to be in bed by ${plan.bedtime} for ${fmtH(plan.needMin)} of sleep${plan.debtMin > 60 ? ` (you're ${fmtH(plan.debtMin)} behind this week)` : ''}.`, url: '/#sleep', tag: 'crescent_moon' };
}

export function weeklyMessage(review): PushMessage {
  return { title: 'Your weekly review is ready', body: review?.headline || 'See how your week went.', url: '/#insights', tag: 'bar_chart' };
}
