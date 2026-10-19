import crypto from 'node:crypto';
import { getKv, setKv } from './db';

// Notifications via ntfy (https://ntfy.sh): free, has an iPhone app, no keys or accounts.
// Pulse generates a private random topic on first use and stores it in your database;
// the ntfy app subscribes to that topic. Override with NTFY_TOPIC / NTFY_SERVER (and NTFY_TOKEN for a private server).
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

export const ntfyServer = () => (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
export const pushConfigured = () => !!process.env.DATABASE_URL;

export async function getTopic(): Promise<string> {
  if (process.env.NTFY_TOPIC) return process.env.NTFY_TOPIC;
  const saved = (await getKv('ntfy_topic')) as string | null;
  if (saved) return saved;
  const topic = 'pulse-' + crypto.randomBytes(18).toString('base64url').replace(/[^a-zA-Z0-9]/g, 'x');
  await setKv('ntfy_topic', topic);
  return topic;
}

function appBase(fallback?: string) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return fallback?.replace(/\/+$/, '');
}

// Sends one notification; tapping it opens the app at msg.url
export async function sendToAll(msg: PushMessage, origin?: string) {
  if (!pushConfigured()) return { sent: 0, skipped: 'no database' };
  const topic = await getTopic();
  const base = appBase(origin);
  try {
    const res = await fetch(ntfyServer(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
      body: JSON.stringify({ topic, title: msg.title, message: msg.body, ...(base && msg.url ? { click: base + msg.url } : {}), ...(msg.tag ? { tags: [msg.tag] } : {}) }),
    });
    return res.ok ? { sent: 1 } : { sent: 0, error: `ntfy responded ${res.status}` };
  } catch (e: any) {
    return { sent: 0, error: e.message };
  }
}
