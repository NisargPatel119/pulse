import { loadDays, saveDays, getKv, setKv } from './db';
import { connected, fetchDays } from './health';
import { enrich, insights } from './scores';
import { demoDays } from './demo';

export const isDemoDeployment = () => process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';
const STALE_MS = 30 * 60 * 1000;

export async function getPrefs() {
  if (!process.env.DATABASE_URL) return { sleepNeedHours: 8 };
  return { sleepNeedHours: 8, ...((await getKv('prefs')) ?? {}) };
}
export const setPrefs = async (p: object) => setKv('prefs', { ...(await getPrefs()), ...p });

// Pull the latest from Google Health and merge it into Postgres
export async function sync() {
  const { days, status, sample } = await fetchDays(35);
  await saveDays(days as { date: string }[]);
  const meta = { fetchedAt: new Date().toISOString(), status, sample };
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
    days = demoDays(45);
    source = 'demo';
    meta = { fetchedAt: new Date().toISOString() };
  } else {
    meta = (await getKv('sync_meta')) ?? {};
    if (refresh || !meta.fetchedAt || Date.now() - new Date(meta.fetchedAt).getTime() > STALE_MS) {
      try { meta = await sync(); } catch (e: any) { meta = { ...meta, status: { sync: { ok: false, error: e.message } } }; }
    }
    days = await loadDays(90);
  }
  enrich(days, prefs);
  return { source, fetchedAt: meta.fetchedAt, prefs, days, insights: insights(days, prefs), status: meta.status ?? {}, sample: meta.sample };
}
