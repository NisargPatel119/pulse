# Pulse

A free, private Whoop/Bevel-style dashboard for your **Fitbit Air**: recovery, sleep, strain and proactive insights. Same setup as Moneta: Next.js on Vercel, Neon Postgres, password login, and it installs on your iPhone home screen.

```bash
npm install
npm run demo        # http://localhost:3002, made-up data, no accounts needed
```

## Why Google, not Apple Health?
Bevel reads Apple Health, which only exists on-device, so it needs a native iPhone app. Your Fitbit Air syncs to your Google account instead, and the Google Health API is the only way to get that data off it. Pulse pulls from that API on the server and stores it in your own database, so the iPhone just opens a web page, with no App Store app or Apple Health involved. (Google's setup is a one-time chore, below.)

## Deploy (free)
1. **Neon:** create a free Postgres database, copy the connection string. Tables are created automatically.
2. **Google Cloud:** new project, enable **Google Health API**. OAuth consent screen: External, add your Google account as a test user, add the four `googlehealth.*.readonly` scopes (sleep, health_metrics_and_measurements, activity_and_fitness, profile). Then set **Publishing status to "In production"** (it stays unverified, which is fine for just you). In *Testing* mode Google expires your login every 7 days.
3. **Vercel:** import this folder as a project and set the env vars from `.env.example` (`APP_PASSWORD`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`). Deploy.
4. **Google credentials:** create an OAuth client of type *Web application* with the redirect URI `https://<your-app>.vercel.app/api/oauth/callback` (add `http://localhost:3002/api/oauth/callback` too if you want to run locally), then put its ID and secret in Vercel and redeploy.
5. Open the app, sign in, tap **Connect Fitbit**, approve (you'll see an "unverified app" warning: Advanced -> continue).
6. **iPhone:** open the site in Safari -> Share -> **Add to Home Screen**.

Data syncs when you open the app (if older than 30 min), on **Refresh**, and daily at 11:00 UTC via Vercel Cron.

## What you get
Six tabs, built to work as well on your iPhone as on a laptop:
- **Today:** Recovery, Sleep and Strain rings, an AI-written morning briefing (optional), today's target strain, tonight's bedtime plan, and your top insights.
- **Sleep:** performance score broken into duration, efficiency, restorative and consistency; stage timeline; sleep-need plan with debt; bed and wake times; per-night stage charts.
- **Recovery:** what is driving your score (HRV, resting HR, respiration, SpO2, skin temperature vs your 28-day baseline), trend charts with baseline bands, and **what moves your recovery** (correlations from your own data).
- **Activity:** strain, steps, active zone minutes, the 150-minute weekly goal, and a workout log.
- **Trends:** 7/30/90-day ranges, this week vs last, a recovery calendar, highlights.
- **Coach (optional AI):** a daily briefing and chat that answers questions using your real numbers. Add a free `GROQ_API_KEY` (console.groq.com/keys) in Vercel and redeploy. Without it everything else still works.

Insights are generated automatically: daily training call, sleep debt, bedtime consistency, deep/REM flags, HRV trends, illness/overreach warnings, low SpO2, activity goals and personal patterns.

## Notes
- Google Health API response shapes were only partly documented, so field extraction is tolerant. After connecting, open **Data connection details** at the bottom of the dashboard: a metric with an error or 0 records shows what to adjust in `src/lib/health.ts`. Set `PULSE_TZ` (e.g. `America/Los_Angeles`) if you are not on US Eastern time. `/api/raw?p=/users/me/dataTypes/sleep/dataPoints?pageSize=1` (signed in) shows raw responses.
- Scores are estimates, not Whoop's algorithms, and not medical advice. One user, one password per deployment.
