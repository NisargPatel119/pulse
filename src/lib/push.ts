import webpush from 'web-push';
import { getKv, setKv } from './db';

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
let ready = false;

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

function init() {
  if (ready) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
  return true;
}

export async function listSubs(): Promise<Sub[]> {
  return ((await getKv('push_subs')) as Sub[]) ?? [];
}
export async function addSub(sub: Sub) {
  const subs = await listSubs();
  if (!subs.some((s) => s.endpoint === sub.endpoint)) await setKv('push_subs', [...subs, sub]);
}
export async function removeSub(endpoint: string) {
  await setKv('push_subs', (await listSubs()).filter((s) => s.endpoint !== endpoint));
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

// Sends to every subscribed device and prunes subscriptions the push service says are gone
export async function sendToAll(msg: PushMessage) {
  if (!init()) return { sent: 0, dead: 0, skipped: 'push not configured' };
  const subs = await listSubs();
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification(s, JSON.stringify(msg)); sent++; }
    catch (e: any) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); }
  }));
  if (dead.length) await setKv('push_subs', subs.filter((s) => !dead.includes(s.endpoint)));
  return { sent, dead: dead.length };
}
