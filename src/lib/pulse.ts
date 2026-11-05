import { loadDays, saveDays, getKv, setKv } from './db';
import { connected, fetchDays } from './health';
import { enrich, insights, analytics } from './scores';
import { demoDays } from './demo';
import { healthspan } from './healthspan';
import { weeklyReview } from './weekly';

export const isDemoDeployment = () => process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';

export async function getPrefs() {
  if (!process.env.DATABASE_URL) return { sleepNeedHours: 8 };
  return { sleepNeedHours: 8, ...((await getKv('prefs')) ?? {}) };
}
export const setPrefs = async (p: object) => setKv('prefs', { ...(await getPrefs()), ...p });

// Pull the latest from Google Health and merge it into Postgres.
// First sync backfills 180 days; later syncs only refresh the last 10.
export async function sync() {
  const have = (await loadDays(200)).length;
  const prev: any = await getKv('sync_meta');
  const full = have < 30 || !(prev?.backfill >= 180); // one-time deeper backfill for existing installs
  const age = Number((await getPrefs()).age);
  const { days, status, sample } = await fetchDays(full ? 180 : 10, { hrDays: full ? 30 : 7, hrMax: age >= 16 && age <= 100 ? 208 - 0.7 * age : null });
  const results = Object.values(status as Record<string, any>);
  const anyOk = results.some((s) => s.ok);
  const authFailed = results.some((s) => !s.ok && s.auth);
  if (authFailed && !anyOk) {
    // Google rejected the saved login for everything: keep the stored data, remember that a reconnect is needed
    const old: any = await getKv('auth_state');
    await setKv('auth_state', { expired: true, since: old?.expired ? old.since : new Date().toISOString() });
    const meta = { ...(prev ?? {}), status, authExpired: true };
    await setKv('sync_meta', meta);
    return meta;
  }
  await setKv('auth_state', { expired: false });
  await saveDays(days as { date: string }[]);
  const meta = { fetchedAt: new Date().toISOString(), status, sample, backfill: full ? 180 : prev?.backfill, authExpired: false };
  await setKv('sync_meta', meta);
  return meta;
}

export async function isConnected() {
  if (isDemoDeployment() || !process.env.DATABASE_URL) return false;
  try { return await connected(); } catch { return false; }
}

export async function payload({ refresh = false, demo = false } = {}) {
  const prefs = await getPrefs();
  let days, source = 'fitbit', meta: any = {};
  if (demo || !(await isConnected())) {
    days = demoDays(180);
    source = 'demo';
    meta = { fetchedAt: new Date().toISOString() };
  } else {
    meta = (await getKv('sync_meta')) ?? {};
    if (refresh || !meta.fetchedAt) { // otherwise the app shows stored data instantly and asks for a refresh in the background
      try { meta = await sync(); } catch (e: any) { meta = { ...meta, status: { sync: { ok: false, error: e.message } } }; }
    }
    days = await loadDays(200);
  }
  const authState: any = source === 'demo' ? null : await getKv('auth_state');
  // Demo mode shows a sample profile so Healthspan is visible
  const hsPrefs = source === 'demo' ? { age: 34, sex: 'male', ...prefs } : prefs;
  enrich(days, prefs);
  const ins = insights(days, prefs), an = analytics(days, prefs), hs = healthspan(days, hsPrefs);
  return {
    source, fetchedAt: meta.fetchedAt, prefs, days,
    insights: ins, analytics: an, healthspan: hs, weekly: weeklyReview(days, an, hs, ins),
    status: meta.status ?? {}, sample: meta.sample,
    auth: { expired: !!authState?.expired, since: authState?.since ?? null },
    aiEnabled: !!process.env.GROQ_API_KEY,
  };
}
