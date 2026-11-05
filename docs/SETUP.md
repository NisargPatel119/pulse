# Self-hosting Pulse

This guide takes you from nothing to a private Pulse running on your own free accounts, with your Fitbit data in it. Plan on **about 30 minutes**, most of it in the Google Cloud console. You only do this once.

**You will need:** a GitHub account, a [Vercel](https://vercel.com) account, a [Neon](https://neon.tech) account, a Google account that your Fitbit is linked to, and a computer for the setup (the finished app works great on your phone).

> Want to look around first? Run `npm install && npm run demo` and open http://localhost:3002. It uses made-up data and needs no accounts.

---

## Overview

```
1. Deploy to Vercel        (the app, running in demo mode)
2. Add a Neon database     (stores your data)
3. Set up Google Cloud     (lets Pulse read YOUR Fitbit data, read-only)
4. Add keys, redeploy, connect
5. Add to your phone's home screen
```

Steps 1 and 2 give you a working app with demo data. Step 3 is what connects your real data.

---

## 1. Deploy to Vercel

1. Click **Deploy with Vercel** in the [README](../README.md), or import your own fork of this repo at <https://vercel.com/new>.
2. When asked for environment variables, set these two (your Google keys and database are added in steps 2 to 4):

   | Variable | Value |
   |---|---|
   | `APP_PASSWORD` | A long, unique password. Anyone with it can see your health data. |
   | `CRON_SECRET` | Any long random string (for example from `openssl rand -hex 32`). |

3. Deploy. You will get a URL like `https://pulse-yourname.vercel.app`. **Write it down**, you need it for Google.

> Until you finish step 2 the app shows demo data. That is expected.

## 2. Add a Neon database

1. In your Vercel project open **Storage**, choose **Create Database**, and pick **Neon** (Postgres). The free plan is plenty.
2. Leave any "environment variable prefix" **blank** so the variable is named exactly `DATABASE_URL`, and connect it to **Production**.
3. **Redeploy** (Deployments, then the three dots on the latest one, then Redeploy) so the new variable takes effect. Tables are created automatically the first time they are needed.

Open your app and sign in with `APP_PASSWORD`. You should see the demo dashboard.

## 3. Set up Google Cloud

This step registers your own private "app" with Google so you can authorize it to read your own Fitbit data. Nobody else can use it, and it costs nothing.

### 3a. Create the project and enable the API
1. Go to <https://console.cloud.google.com> and create a **new project** (any name, for example `pulse`).
2. Open **APIs & Services, then Library**, search for **Google Health API**, and click **Enable**.

### 3b. Configure the OAuth consent screen ("Google Auth Platform")
Open **Google Auth Platform** (search for it in the console) and set it up:

1. **Branding**
   - App name: `Pulse` (or anything).
   - User support email and developer contact email: your email.
   - **Application home page:** your Vercel URL, e.g. `https://pulse-yourname.vercel.app`
   - **Application privacy policy link:** your Vercel URL plus `/privacy`, e.g. `https://pulse-yourname.vercel.app/privacy` (Pulse serves this page for you).
   - **Authorized domains:** your Vercel domain, e.g. `pulse-yourname.vercel.app`.
   - Save.
2. **Audience**
   - User type: **External**.
3. **Data Access** → **Add or remove scopes**. Search for "Google Health API" and add these four read-only scopes:
   - `.../auth/googlehealth.sleep.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.profile.readonly`
4. **Publish the app: this is the step people miss.**
   Back on **Audience**, click **Publish app** and confirm, so the status reads **In production**.

   > **Why this matters.** In *Testing* mode Google expires your login every **7 days**, and Pulse silently stops getting new data. Publishing makes the login long-lived. The app stays "unverified", which is fine for personal use (it just shows a warning once when you connect, and is limited to 100 users, which you will never reach).
   >
   > If **Publish app** is greyed out, the Branding page is missing a required field. Google needs an app name, support email, **home page URL** and **privacy policy URL**.

### 3c. Create the OAuth client
1. Open **Clients** (in Google Auth Platform) and click **Create client**.
2. Application type: **Web application**.
3. **Authorized redirect URIs:** add
   `https://pulse-yourname.vercel.app/api/oauth/callback`
   (use your real URL; add `http://localhost:3002/api/oauth/callback` as well if you also want to run it locally).
4. Create. Copy the **Client ID** and **Client secret**.

## 4. Add the keys and connect

1. In Vercel, open **Settings, then Environment Variables** and set:
   - `GOOGLE_CLIENT_ID` = the client ID
   - `GOOGLE_CLIENT_SECRET` = the client secret
2. **Redeploy** so they take effect.
3. Open your app, sign in, and tap **Connect Fitbit** (a button on the banner, or in Settings via the gear icon).
4. Google will say **"Google hasn't verified this app"**. That is expected for your own app: tap **Advanced**, then **Go to your-app (unsafe)**, and approve the four read-only permissions.
5. Pulse backfills about 6 months of history. Tap **Refresh** once, then check **Settings, then Data health**: most metrics should show data for most of the last 30 days.

Then open **Settings** and enter your **age and sex**. They are needed for *Pulse Age* (biological age) and for your max heart rate.

## 5. Add it to your phone

- **iPhone:** open your app URL in **Safari**, tap Share, then **Add to Home Screen**.
- **Android:** open it in Chrome, then menu, then **Install app** / **Add to Home screen**.

---

## Optional extras

### Notifications (free, no accounts)
Pulse sends a morning briefing, a bedtime reminder and a weekly review through the free **ntfy** app.
1. Install **ntfy** on your phone.
2. In Pulse open **Settings → Notifications**, tap **Subscribe in ntfy** (or add the topic shown), then **Send a test**.

Pulse generates a private random topic and stores it in your database. Messages pass through `ntfy.sh`; to use your own server set `NTFY_SERVER` (and `NTFY_TOKEN` if it needs auth). Set `NTFY_TOPIC` to choose your own topic and `APP_URL` for the link opened when you tap a notification.

### AI coach (free)
Get a free key at <https://console.groq.com/keys> (no credit card), add it to Vercel as `GROQ_API_KEY`, and redeploy. You get an AI-written morning briefing and a chat that answers questions using your real numbers. Only a short numbers-only summary is sent. Set `GROQ_MODEL` to change the model.

### Time zone and notification times
- Set `PULSE_TZ` (for example `America/Los_Angeles`) so days, bedtimes and notifications use your time zone. The default is `America/New_York`.
- Vercel's free plan runs scheduled jobs once a day at a fixed UTC time. Edit the two schedules in [`vercel.json`](../vercel.json) to suit you: `/api/cron/sync` (daily sync and morning notification, default 11:00 UTC) and `/api/cron/evening` (bedtime reminder, default 01:00 UTC).

### Show a public demo
A second Vercel project with `DEMO_MODE=true` shows made-up data with no login. Never set it on the project that holds your real data. Leave `GROQ_API_KEY` unset there so strangers don't use your AI quota.

---

## Environment variables

| Variable | Required | What it does |
|---|:---:|---|
| `APP_PASSWORD` | yes | The password for signing in. Changing it signs out every device. |
| `DATABASE_URL` | yes | Neon Postgres connection string (added for you by the Neon integration). |
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID from step 3c. |
| `GOOGLE_CLIENT_SECRET` | yes | OAuth client secret from step 3c. |
| `CRON_SECRET` | yes | Random string. Vercel sends it with scheduled jobs; without it the jobs are refused. |
| `PULSE_TZ` | no | IANA time zone. Default `America/New_York`. |
| `GROQ_API_KEY` | no | Turns on the AI coach. |
| `GROQ_MODEL` | no | Override the AI model. |
| `NTFY_SERVER` / `NTFY_TOPIC` / `NTFY_TOKEN` | no | Use your own ntfy server or topic. |
| `APP_URL` | no | Link opened when a notification is tapped. Defaults to your Vercel production URL. |
| `DEMO_MODE` | no | `true` shows made-up data with no login. Demo deployments only. |

## Updating

If you forked the repo, use **Sync fork** on GitHub; Vercel redeploys on its own. Your data lives in Neon, so updates never touch it. Tables are upgraded automatically.

## Running locally

```bash
npm install
cp .env.example .env.local    # fill in the values
npm run dev                   # http://localhost:3002
npm run demo                  # same, but with demo data and no setup
```

---

## Troubleshooting

**"Token has been expired or revoked", or Pulse shows "lost its connection to Google".**
Your Google login stopped working. The usual cause is that the consent screen is still in **Testing** mode (7-day logins). Open Google Cloud → Google Auth Platform → **Audience** and **Publish app** (see 3b), then tap **Reconnect to Google** in Pulse. Your saved history is kept. Revoking access in your Google account does the same thing.

**"Access blocked: has not completed the Google verification process" / `access_denied`.**
The app is in Testing and your account is not a test user. Publish the app (3b), or add yourself under Audience → Test users.

**`redirect_uri_mismatch`.**
The redirect URI in your OAuth client doesn't exactly match your app. It must be `https://your-domain/api/oauth/callback`, with no trailing slash.

**The app doesn't show today's data until I open the Fitbit / Google Health app.**
Pulse can only show what Google has received. Your band syncs to the Google Health app over Bluetooth, so make sure the phone allows **Background App Refresh** and Bluetooth for it, **Low Power Mode is off**, and you don't swipe the app away. Pulse then re-checks automatically and shows a "Today's data isn't in yet" notice with a **Check again** button.

**Some metrics are missing.**
Open **Settings, then Data health**. It lists each metric, how many of the last 30 days arrived, and the exact error from the last sync. Skin temperature and blood oxygen need several nights of wear; VO₂ max only appears after GPS walks or runs. For raw responses, sign in and open
`/api/raw?p=/users/me/dataTypes/sleep/dataPoints?pageSize=1`.

**I pushed a commit but Vercel didn't deploy.**
Check the project's Settings → Git connection. Pushing an empty commit (`git commit --allow-empty -m "redeploy" && git push`) re-sends the notification.

**Database errors.**
Confirm `DATABASE_URL` is set for **Production** and that you redeployed after adding it. Leave the Neon integration's variable prefix blank.

**Scheduled jobs don't run.**
Confirm `CRON_SECRET` is set. On Vercel's free plan each job can run only once a day.

Still stuck? [Open an issue](https://github.com/NisargPatel119/pulse/issues/new/choose) and include what the **Data health** screen says. Never post your passwords, keys or database URL.

## Privacy and security notes

- Your data stays in your own Neon database and is served by your own Vercel project. Pulse has no analytics or tracking.
- Choose a long, unique `APP_PASSWORD`. Sessions are signed cookies; changing the password signs out every device.
- Never commit `.env` files. They are git-ignored.
- To revoke Pulse's access to your Google account at any time: <https://myaccount.google.com/permissions>.
- To delete your stored data: Settings, then **Disconnect Fitbit**, or delete the Neon database.
