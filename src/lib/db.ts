import { neon } from '@neondatabase/serverless';

const connect = () => neon(process.env.DATABASE_URL!);
export const sql: ReturnType<typeof connect> = process.env.DATABASE_URL
  ? connect()
  : ((() => { throw new Error('DATABASE_URL is not set'); }) as unknown as ReturnType<typeof connect>);

let schemaReady: Promise<void> | null = null;
function ensureSchema() {
  schemaReady ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS pulse_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`;
    // One row per day ('YYYY-MM-DD'): the merged sleep/HRV/RHR/steps record
    await sql`CREATE TABLE IF NOT EXISTS pulse_days (date TEXT PRIMARY KEY, data JSONB NOT NULL)`;
  })().catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

export async function getKv(key: string) {
  await ensureSchema();
  const rows = await sql`SELECT value FROM pulse_kv WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}
export async function setKv(key: string, value: unknown) {
  await ensureSchema();
  await sql`INSERT INTO pulse_kv (key, value) VALUES (${key}, ${JSON.stringify(value)}::jsonb)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}
export async function delKv(key: string) {
  await ensureSchema();
  await sql`DELETE FROM pulse_kv WHERE key = ${key}`;
}
export async function saveDays(days: { date: string }[]) {
  await ensureSchema();
  for (const d of days) {
    await sql`INSERT INTO pulse_days (date, data) VALUES (${d.date}, ${JSON.stringify(d)}::jsonb)
              ON CONFLICT (date) DO UPDATE SET data = pulse_days.data || EXCLUDED.data`;
  }
}
export async function loadDays(limit = 90) {
  await ensureSchema();
  const rows = await sql`SELECT data FROM (SELECT date, data FROM pulse_days ORDER BY date DESC LIMIT ${limit}) t ORDER BY date ASC`;
  return rows.map(r => r.data);
}
export async function wipe() {
  await ensureSchema();
  await sql`DELETE FROM pulse_days`;
  await sql`DELETE FROM pulse_kv WHERE key <> 'prefs'`;
}
