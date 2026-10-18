import { NextResponse } from 'next/server';
import { payload, isDemoDeployment } from '@/lib/pulse';
import { buildCoachContext } from '@/lib/coachContext';
import { getKv, setKv } from '@/lib/db';

export const maxDuration = 60;

// Groq's free tier: OpenAI-compatible, no credit card. Key: console.groq.com/keys
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SYSTEM = `You are the coach inside Pulse, a private Whoop-style dashboard for one person's Fitbit data.
Use ONLY the data snapshot below. If it lacks the answer, say so plainly. Never invent numbers.
- Be specific: cite real values, dates and baselines from the snapshot.
- Be practical: give 2-4 concrete actions for today and tonight, not generic advice.
- Tone: calm, direct, encouraging. Short paragraphs, **bold** key figures, "-" bullets, no tables, no emojis.
- You give general wellness guidance, not medical advice. If markers suggest illness or something concerning (very low SpO2, big resting HR jump), suggest resting and seeing a clinician if symptoms persist.`;

type Msg = { role: 'user' | 'assistant'; content: string };

async function ask(system: string, messages: Msg[]) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 0.4, reasoning_effort: 'low', max_tokens: 1500, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!r.ok) {
    const status = r.status;
    throw new Error(status === 429 ? 'The free AI limit was hit. Wait a minute and try again.' : status === 401 ? 'GROQ_API_KEY was rejected.' : `AI service error (${status}).`);
  }
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content ?? '').trim();
}

// POST { brief: true, regenerate?: true }  -> today's briefing (cached per day)
// POST { messages: [{role, content}] }     -> chat
export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'NO_KEY' }, { status: 503 });
  const body = await req.json().catch(() => null);
  try {
    const p = await payload();
    const system = `${SYSTEM}\n\n# Data snapshot\n${buildCoachContext(p)}`;
    if (body?.brief) {
      const key = `brief_${new Date().toISOString().slice(0, 10)}_${p.source}`;
      const canCache = !isDemoDeployment() && !!process.env.DATABASE_URL && p.source !== 'demo';
      if (canCache && !body.regenerate) { const c = await getKv(key); if (c?.text) return NextResponse.json({ text: c.text, cached: true }); }
      const text = await ask(system, [{ role: 'user', content: "Write my morning briefing. Sections: **Today** (readiness and what effort level fits, with target strain), **Sleep** (how last night went and tonight's bedtime), **Watch** (anything unusual in my markers, or say all clear), **One thing** (the single most valuable habit change from my data). Keep it under 220 words." }]);
      if (canCache) await setKv(key, { text });
      return NextResponse.json({ text });
    }
    const messages: Msg[] = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
      .slice(-12).map((m: any) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'Send a user message.' }, { status: 400 });
    return NextResponse.json({ text: await ask(system, messages) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
