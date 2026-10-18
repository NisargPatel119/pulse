import { loadDays, saveDays, getKv, setKv } from './db';
import { connected, fetchDays } from './health';
import { enrich, insights, analytics } from './scores';
import { demoDays } from './demo';
import { healthspan } from './healthspan';

export const isDemoDeployment = () => process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';
const STALE_MS = 30 * 60 * 1000;

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
  const { days, status, sample } = await fetchDays(full ? 180 : 10);
  await saveDays(days as { date: string }[]);
  const meta = { fetchedAt: new Date().toISOString(), status, sample, backfill: full ? 180 : prev?.backfill };
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
    if (refresh || !meta.fetchedAt || Date.now() - new Date(meta.fetchedAt).getTime() > STALE_MS) {
      try { meta = await sync(); } catch (e: any) { meta = { ...meta, status: { sync: { ok: false, error: e.message } } }; }
    }
    days = await loadDays(200);
  }
  // Demo mode shows a sample profile so Healthspan is visible
  const hsPrefs = source === 'demo' ? { age: 34, sex: 'male', ...prefs } : prefs;
  enrich(days, prefs);
  return {
    source, fetchedAt: meta.fetchedAt, prefs, days,
    insights: insights(days, prefs), analytics: analytics(days, prefs), healthspan: healthspan(days, hsPrefs),
    status: meta.status ?? {}, sample: meta.sample,
    aiEnabled: !!process.env.GROQ_API_KEY,
  };
}
