// @ts-nocheck
// Google Health API client: OAuth (PKCE) + tolerant normalization into daily records.
// Tokens and PKCE state live in Postgres (serverless has no local disk).
import crypto from 'node:crypto';
import { getKv, setKv, delKv } from './db';

const BASE = 'https://health.googleapis.com/v4';

// Thrown when Google says the saved login is no longer valid (expired, revoked, or rejected)
class AuthError extends Error { constructor(m) { super(m); this.name = 'AuthError'; } }
const SCOPES = ['sleep', 'health_metrics_and_measurements', 'activity_and_fitness', 'profile']
  .map((s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`);

export const config = () => ({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET });

export async function authUrl(redirectUri) {
  const { clientId } = config();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set - see README.');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  await setKv('oauth_pending', { verifier, state, redirectUri, at: Date.now() });
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', state,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params) {
  const { clientId, clientSecret } = config();
  const body = new URLSearchParams({ client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), ...params });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) { const msg = `Token error: ${j.error_description || j.error}`; throw (j.error === 'invalid_grant' ? new AuthError(msg) : new Error(msg)); }
  return j;
}

export async function handleCallback(query) {
  const pending = await getKv('oauth_pending');
  if (!pending || query.state !== pending.state || Date.now() - pending.at > 15 * 60000) throw new Error('OAuth state mismatch or expired - start the connection again.');
  const j = await tokenRequest({ code: query.code, grant_type: 'authorization_code', redirect_uri: pending.redirectUri, code_verifier: pending.verifier });
  await delKv('oauth_pending');
  await setKv('tokens', { refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 - 60000 });
  await delKv('auth_state'); // a fresh login clears any 'reconnect needed' flag
}

export const connected = async () => !!(await getKv('tokens'))?.refresh_token;
export const disconnect = async () => { await delKv('tokens'); };

async function accessToken() {
  const t = await getKv('tokens');
  if (!t) throw new Error('Not connected');
  if (t.access_token && t.expires_at > Date.now()) return t.access_token;
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
  await setKv('tokens', { ...t, access_token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 - 60000 });
  return j.access_token;
}

export async function api(pathAndQuery) {
  const r = await fetch(`${BASE}${pathAndQuery}`, { headers: { authorization: `Bearer ${await accessToken()}` } });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
  if (r.status === 401) throw new AuthError('Google rejected the saved login (401)');
  if (!r.ok) throw new Error(`${r.status} ${j.error?.message || text.slice(0, 200)}`);
  return j;
}

async function listAll(type, filter, pageSize, maxPages = 20, extra = {}) {
  const pts = [];
  let token;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ pageSize: String(pageSize) });
    if (filter) q.set('filter', filter);
    for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
    if (token) q.set('pageToken', token);
    const j = await api(`/users/me/dataTypes/${type}/dataPoints?${q}`);
    pts.push(...(j.dataPoints || []));
    token = j.nextPageToken;
    if (!token) break;
  }
  return pts;
}

// ---- tolerant field extraction (response shapes are discovered, not assumed) ----
function* walk(o, p = '') {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { yield [p ? `${p}.${k}` : k, v]; yield* walk(v, p ? `${p}.${k}` : k); }
}
function pick(o, keys) {
  for (const key of keys) for (const [p, v] of walk(o)) if (p.split('.').pop().toLowerCase() === key.toLowerCase() && v != null && typeof v !== 'object') return v;
  return null;
}
const num = (v) => (v == null || v === '' ? null : isFinite(Number(v)) ? Number(v) : null);
const dateOf = (dp) => {
  const d = pick(dp, ['date']);
  if (typeof d === 'string') return d.slice(0, 10);
  const o = dp?.dailyRestingHeartRate?.date || dp?.dailyHeartRateVariability?.date || dp?.dailyOxygenSaturation?.date || dp?.dailyRespiratoryRate?.date || dp?.dailySleepTemperatureDerivations?.date;
  if (o && o.year) return `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`;
  return null;
};
export const TZ = process.env.PULSE_TZ || 'America/New_York';
const localDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

function normalizeSleep(dp) {
  const s = dp.sleep || dp;
  const start = pick(s, ['startTime', 'start_time']), end = pick(s, ['endTime', 'end_time']);
  if (!start || !end) return null;
  const rawStages = s.stages || s.sleepStages || s.levels?.data || [];
  const stagesArr = rawStages.map((x, i) => ({ ...x, endTime: x.endTime || (x.seconds ? new Date(new Date(x.dateTime).getTime() + x.seconds * 1000).toISOString() : rawStages[i + 1]?.startTime || end) }));
  const sum = {};
  for (const st of s.stagesSummary || s.summary?.stagesSummary || []) sum[String(st.type || st.stage).toUpperCase()] = num(st.minutes ?? st.minutesInStage ?? st.count);
  const typeMin = {};
  for (const x of stagesArr) { const k = String(x.type || x.level || '').toUpperCase(); const st = x.startTime || x.dateTime; if (st && x.endTime) typeMin[k] = (typeMin[k] || 0) + (new Date(x.endTime) - new Date(st)) / 60000; }
  for (const k of ['DEEP', 'REM', 'LIGHT']) if (sum[k] == null && typeMin[k] != null) sum[k] = Math.round(typeMin[k]);
  const asleep = num(pick(s, ['minutesAsleep'])), awake = num(pick(s, ['minutesAwake']));
  const inBed = num(pick(s, ['minutesInSleepPeriod'])) ?? (asleep != null && awake != null ? asleep + awake : Math.round((new Date(end) - new Date(start)) / 60000));
  return {
    date: localDate(end), main: s.type ? String(s.type) !== 'NAP' : true,
    sleep: {
      asleep: asleep ?? Math.max(0, inBed - (awake || 0)), awake: awake ?? 0, inBed,
      deep: sum.DEEP ?? null, rem: sum.REM ?? null, light: sum.LIGHT ?? null,
      latency: num(pick(s, ['minutesToFallAsleep'])), start, end,
      stages: stagesArr.map((x) => ({ type: String(x.type || x.level || '').toUpperCase(), start: x.startTime || x.dateTime, end: x.endTime || (x.seconds ? new Date(new Date(x.dateTime).getTime() + x.seconds * 1000).toISOString() : null) })).filter((x) => x.start && x.end),
    },
  };
}


const durSec = (v) => { if (v == null) return null; const m = String(v).match(/([\d.]+)s/); return m ? Number(m[1]) : num(v); };

// ---- intraday heart rate -> zones, HR-based strain (TRIMP) and daytime stress (no manual input) ----
const ZONE_W = [0.4, 1.5, 3, 5, 7]; // Edwards-style TRIMP weights for zones 1-5 (50-60 ... 90-100% of max HR)
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const zoneOf = (bpm, hrMax) => { const p = bpm / hrMax; return p >= 0.9 ? 4 : p >= 0.8 ? 3 : p >= 0.7 ? 2 : p >= 0.6 ? 1 : p >= 0.5 ? 0 : -1; };

function processHeart(hrPts, stepsPts, byDate, hrMaxEst) {
  const smp = [];
  for (const dp of hrPts) {
    const t = pick(dp, ['physicalTime', 'sampleTime', 'time']);
    const b = num(pick(dp, ['beatsPerMinute', 'bpm', 'value']));
    if (t && b != null && b > 30 && b < 230) smp.push([Date.parse(t), b]);
  }
  if (smp.length < 100) return 0;
  smp.sort((x, y) => x[0] - y[0]);
  const bpms = smp.map((s) => s[1]).sort((x, y) => x - y);
  const hrMax = hrMaxEst || Math.max(170, bpms[Math.floor(bpms.length * 0.995)]);

  // minutes with steps = "active"; sedentary samples are those with no activity within +/-5 minutes
  const active = new Set();
  for (const dp of stepsPts) {
    const t = pick(dp, ['startTime', 'start_time']), e = pick(dp, ['endTime', 'end_time']), v = num(pick(dp, ['count', 'steps']));
    if (!t || !v) continue;
    const a = Math.floor(Date.parse(t) / 60000), b = e ? Math.floor(Date.parse(e) / 60000) : a;
    for (let m = a; m <= Math.min(b, a + 30); m++) active.add(m);
  }
  const nearActive = (ms) => { const m = Math.floor(ms / 60000); for (let k = -5; k <= 5; k++) if (active.has(m + k)) return true; return false; };

  const per = {};
  for (let i = 0; i < smp.length - 1; i++) {
    const [t, bpm] = smp[i], gap = smp[i + 1][0] - t;
    const dt = gap <= 5 * 60000 ? gap / 60000 : 0;
    if (!dt) continue;
    const date = dateFmt.format(t);
    const a = (per[date] ??= { z: [0, 0, 0, 0, 0], sum: 0, w: 0, max: 0, sedSum: 0, sedW: 0, hs: Array(24).fill(0), hw: Array(24).fill(0) });
    const z = zoneOf(bpm, hrMax);
    if (z >= 0) a.z[z] += dt;
    a.sum += bpm * dt; a.w += dt; if (bpm > a.max) a.max = bpm;
    const h = Number(hourFmt.format(t)) % 24;
    if (h >= 7 && h < 22 && !nearActive(t)) {
      const rest = byDate[date]?.rhr ?? 62, elev = bpm - rest;
      a.sedSum += elev * dt; a.sedW += dt; a.hs[h] += elev * dt; a.hw[h] += dt;
    }
  }
  const dates = Object.keys(per).sort();
  const level = (elev) => Math.round(Math.min(3, Math.max(0, (elev - 3) / 8)) * 10) / 10;
  dates.slice(1).forEach((date) => { // the oldest date may be partial
    const a = per[date], d = (byDate[date] ??= { date });
    d.hrz = a.z.map((m) => Math.round(m * 10) / 10);
    d.trimp = Math.round(a.z.reduce((s, m, i) => s + m * ZONE_W[i], 0));
    d.hrAvg = a.w ? Math.round(a.sum / a.w) : null;
    d.hrMax = Math.round(a.max);
    if (a.sedW >= 30) { d.stress = level(a.sedSum / a.sedW); d.sedMin = Math.round(a.sedW); d.stressHours = a.hs.map((s, h) => (a.hw[h] >= 3 ? level(s / a.hw[h]) : null)); }
  });

  // per-workout zones and average heart rate
  for (const d of Object.values(byDate)) for (const w of d.workouts || []) {
    if (!w.start || !w.min) continue;
    const a = Date.parse(w.start), b = a + w.min * 60000, z = [0, 0, 0, 0, 0];
    let sum = 0, wt = 0, mx = 0;
    for (let i = 0; i < smp.length - 1; i++) {
      const [t, bpm] = smp[i];
      if (t < a || t > b) continue;
      const gap = smp[i + 1][0] - t, dt = gap <= 5 * 60000 ? gap / 60000 : 0;
      if (!dt) continue;
      const zi = zoneOf(bpm, hrMax); if (zi >= 0) z[zi] += dt;
      sum += bpm * dt; wt += dt; if (bpm > mx) mx = bpm;
    }
    if (wt >= 1) { w.zones = z.map((m) => Math.round(m * 10) / 10); w.hrAvg = w.hrAvg ?? Math.round(sum / wt); w.hrMax = Math.round(mx); }
  }
  return smp.length;
}

export async function fetchDays(n = 35, opts: { hrDays?: number; hrMax?: number | null } = {}) {
  const sinceDate = new Date(Date.now() - (n + 1) * 864e5);
  const since = sinceDate.toISOString(), sinceD = sinceDate.toLocaleDateString('en-CA', { timeZone: TZ });
  const status = {};
  const run = async (name, fn) => { try { const v = await fn(); status[name] = { ok: true, count: v.length }; return v; } catch (e) { status[name] = { ok: false, error: e.message, auth: e?.name === 'AuthError' }; return []; } };

  const hrSince = new Date(Date.now() - ((opts.hrDays || 7) + 1) * 864e5).toISOString();
  const [sleeps, rhr, hrv, spo2, resp, steps, azm, ex, temp, vo2, hrPts] = await Promise.all([
    run('sleep', () => listAll('sleep', `sleep.interval.end_time >= "${since}"`, 25, 10)),
    run('resting-heart-rate', () => listAll('daily-resting-heart-rate', `daily_resting_heart_rate.date >= "${sinceD}"`, 100)),
    run('heart-rate-variability', () => listAll('daily-heart-rate-variability', `daily_heart_rate_variability.date >= "${sinceD}"`, 100)),
    run('oxygen-saturation', () => listAll('daily-oxygen-saturation', `daily_oxygen_saturation.date >= "${sinceD}"`, 100)),
    run('respiratory-rate', () => listAll('daily-respiratory-rate', `daily_respiratory_rate.date >= "${sinceD}"`, 100)),
    run('steps', () => listAll('steps', `steps.interval.start_time >= "${since}"`, 10000, 20)),
    run('active-zone-minutes', () => listAll('active-zone-minutes', `active_zone_minutes.interval.start_time >= "${since}"`, 10000, 20)),
    run('exercise', () => listAll('exercise', `exercise.interval.civil_start_time >= "${sinceD}"`, 25, 12)),
    run('skin-temperature', async () => {
      try { return await listAll('daily-sleep-temperature-derivations', `daily_sleep_temperature_derivations.date >= "${sinceD}"`, 100); }
      catch (e) { if (e?.name === 'AuthError') throw e; return await listAll('daily-sleep-temperature-derivations', null, 100, 5, { startTime: since, endTime: new Date().toISOString() }); }
    }),
    run('vo2-max', () => listAll('vo2-max', `vo2_max.sample_time.physical_time >= "${since}"`, 100, 2)),
    run('heart-rate', () => listAll('heart-rate', `heart_rate.sample_time.physical_time >= "${hrSince}"`, 10000, 16)),
  ]);

  const byDate = {};
  const get = (d) => (byDate[d] ??= { date: d });
  for (const dp of sleeps) { const s = normalizeSleep(dp); if (s && s.main) { const d = get(s.date); if (!d.sleep || s.sleep.asleep > d.sleep.asleep) d.sleep = s.sleep; } }
  const daily = (pts, key, keys) => { for (const dp of pts) { const date = dateOf(dp); const v = num(pick(dp, keys)); if (date && v != null) get(date)[key] = v; } };
  daily(rhr, 'rhr', ['beatsPerMinute', 'restingHeartRate', 'value']);
  daily(hrv, 'hrv', ['averageHeartRateVariabilityMilliseconds', 'heartRateVariabilityMilliseconds', 'rmssd', 'dailyRmssd', 'average']);
  daily(spo2, 'spo2', ['averagePercentage', 'average', 'percentage', 'value']);
  daily(resp, 'resp', ['breathsPerMinute', 'averageBreathsPerMinute', 'fullSleepBreathsPerMinute', 'value']);
  // Nightly wrist temperature: Google sends the night's value and a personal baseline; the deviation is the difference
  for (const dp of temp) {
    const date = dateOf(dp), night = num(pick(dp, ['nightlyTemperatureCelsius'])), base = num(pick(dp, ['baselineTemperatureCelsius']));
    if (!date || night == null) continue;
    const d = get(date);
    d.tempAbs = night;
    if (base != null) { d.tempBase = base; d.temp = Math.round((night - base) * 100) / 100; }
  }
  for (const dp of vo2) { const t = pick(dp, ['physicalTime', 'sampleTime', 'time']); const v = num(pick(dp, ['vo2Max', 'vo2MaxMlPerKgPerMin', 'value'])); if (t && v != null) get(localDate(t)).vo2 = v; }

  // Sums only count whole days: the oldest (partial) day in the window is skipped
  const sumBy = (pts, key, keys) => {
    for (const dp of pts) {
      const t = pick(dp, ['startTime', 'start_time']); const v = num(pick(dp, keys));
      if (!t || v == null) continue;
      const date = localDate(t);
      if (date <= sinceD) continue;
      const d = get(date); d[key] = (d[key] || 0) + v;
    }
  };
  sumBy(steps, 'steps', ['count', 'steps']);
  sumBy(azm, 'azm', ['totalMinutes', 'activeZoneMinutes', 'minutes', 'count']);

  for (const dp of ex) {
    const e = dp.exercise || dp;
    const t = pick(e, ['startTime', 'start_time']), en = pick(e, ['endTime', 'end_time']);
    if (!t) continue;
    const sec = durSec(pick(e, ['activeDuration'])) ?? (en ? (new Date(en) - new Date(t)) / 1000 : null);
    const dist = num(pick(e, ['distanceMillimeters']));
    const w = {
      name: pick(e, ['displayName']) || String(pick(e, ['exerciseType']) || 'Workout').toLowerCase().replace(/_/g, ' '),
      type: String(pick(e, ['exerciseType']) || ''), start: t, min: sec ? Math.round(sec / 60) : null,
      kcal: num(pick(e, ['caloriesKcal'])), avgHr: num(pick(e, ['averageHeartRateBeatsPerMinute'])), azm: num(pick(e, ['activeZoneMinutes'])),
      km: dist != null ? Math.round(dist / 10) / 100 : null,
    };
    (get(localDate(t)).workouts ??= []).push(w);
  }
  for (const d of Object.values(byDate)) if (d.workouts) { d.workouts.sort((a, b) => a.start.localeCompare(b.start)); d.exMin = d.workouts.reduce((s, w) => s + (w.min || 0), 0); }

  try { processHeart(hrPts, steps, byDate, opts.hrMax ?? null); } catch (e) { status['heart-rate'] = { ok: false, error: 'processing: ' + e.message }; }
  const days = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  return { days, status, sample: { sleep: sleeps[0] && { ...sleeps[0], sleep: { ...sleeps[0].sleep, stages: '…' } }, hrv: hrv[0], rhr: rhr[0], temp: temp[0], exercise: ex[0] } };
}
