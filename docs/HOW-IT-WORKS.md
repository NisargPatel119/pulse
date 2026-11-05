# How Pulse works

Pulse is deliberately transparent: every number on screen comes from a short formula you can read in `src/lib/`. This page explains the data it uses, how each score is computed, and where the numbers come from. It is written so you can judge the methods, or improve them.

> **These are wellness estimates.** They follow published research and common practice, but they are not WHOOP's, Oura's or Google's proprietary algorithms, and they are not medical advice.

## Data Pulse reads

Pulse uses read-only access to the [Google Health API](https://developers.google.com/health) (the successor to the legacy Fitbit Web API) through your own OAuth login.

| Data | Google Health API type | Used for |
|---|---|---|
| Sleep sessions and stages | `sleep` | Sleep score, plan, stage charts |
| HRV (overnight) | `daily-heart-rate-variability` | Recovery |
| Resting heart rate | `daily-resting-heart-rate` | Recovery, Pulse Age |
| Blood oxygen | `daily-oxygen-saturation` | Recovery, alerts |
| Breathing rate | `daily-respiratory-rate` | Recovery |
| Skin temperature | `daily-sleep-temperature-derivations` | Recovery, illness flag |
| Steps | `steps` | Strain, Pulse Age |
| Active zone minutes | `active-zone-minutes` | Strain, goals, Pulse Age |
| Workouts | `exercise` | Workout log, strength minutes |
| Heart rate (intraday) | `heart-rate` | Strain, zones, daytime stress |
| VO₂ max | `vo2-max` | Pulse Age |

**Sync.** The first sync backfills about 180 days (30 days of intraday heart rate). After that it refreshes the last 10 days (7 of heart rate). It runs when you open the app, once a day on a schedule, and automatically re-checks while it is waiting for a new night of sleep. Everything is stored in your Postgres database, one row per day.

## Recovery (0-100%)

Compares last night's markers with **your own** 28-day baseline, so a "good" number is good *for you*.

For each marker, `z = (today − baseline mean) / baseline standard deviation`, clamped to ±3 and signed so that "better" is positive:

| Marker | Weight | Better when |
|---|---:|---|
| HRV (overnight RMSSD) | 50% | higher |
| Resting heart rate | 25% | lower |
| Sleep performance | 15% | higher (centered at 75) |
| Breathing rate | 5% | lower |
| Blood oxygen | 5% | higher |
| Skin temperature | 5% | closer to baseline |

`recovery = clamp(60 + 20 × weightedAverage(z), 1, 99)`. A baseline needs at least 4 prior days; markers without one are skipped and the rest are re-weighted.

- 67-100% **Primed**, 34-66% **Moderate**, 0-33% **Low**.
- Today's **target strain** follows from it: 14-18 when primed, 8-13 when moderate, under 8 when low.

## Sleep performance (0-100%)

| Part | Weight | Calculation |
|---|---:|---|
| Duration | 50% | time asleep ÷ your sleep need (capped at 100%) |
| Efficiency | 20% | time asleep ÷ time in bed, scaled so 70% → 0 and 95% → 100 |
| Restorative | 20% | (deep + REM) ÷ time asleep, scaled so 40% → 100 |
| Consistency | 10% | how close tonight's bedtime is to the previous week's average (within 2 hours) |

**Sleep need** starts from your baseline setting (default 8 h) and adds a quarter of this week's sleep debt (up to 1 hour) plus 15 or 30 minutes after a strain of 10+ or 14+, capped at 90 minutes above baseline. The suggested bedtime is your average wake time minus the need, your usual time to fall asleep, and a 10-minute buffer.

## Strain (0-21)

A logarithmic scale like WHOOP's: easy to rise early, hard to rise late.

- **From heart rate (preferred).** Minutes in each heart-rate zone (as a share of max heart rate: 50-60%, 60-70%, 70-80%, 80-90%, 90%+) are weighted `0.4, 1.5, 3, 5, 7` and summed into a load. `strain = 21 × (1 − e^(−load / 150))`. Max heart rate is `208 − 0.7 × age` (Tanaka) from the age you enter, or the highest reading seen.
- **Fallback (no heart-rate data).** `load = steps/1000 + 1.2 × activeZoneMinutes + workout time`, with `strain = 21 × (1 − e^(−load / 45))`.

## Daytime stress (0-3)

How elevated your heart rate is while you are *sitting still*. Pulse looks at awake hours (7 AM-10 PM) with no steps within 5 minutes either side, and measures how far your heart rate is above your resting rate: `stress = clamp((elevation − 3) / 8, 0, 3)`. It is a heart-rate-based estimate, not a clinical stress test, and needs no input from you.

## Pulse Age and pace of aging

Modeled on how WHOOP describes its Healthspan feature, using published research so the method is open:

1. Seven habits are measured over up to 6 months: daily steps, sleep duration, sleep consistency, resting heart rate, VO₂ max, weekly active zone minutes and weekly strength minutes. A habit with no data is left out (for example VO₂ max until your Fitbit reports one).
2. Each is converted to a **relative mortality risk** using simplified fits to published studies, compared with a healthy reference value.
3. Risk becomes **years** using the Gompertz law (adult mortality risk roughly doubles every 8 years), with a 0.6 shrink factor so overlapping habits aren't double counted. Total years are capped at ±15.
4. `Pulse Age = your age + total years`. **Pace of aging** compares your last 30 days with that baseline (`1 + recent − baseline`, clamped to −1…3): under 1× means your recent habits would slow your aging.

Evidence used (details and curve shapes in [`src/lib/healthspan.ts`](../src/lib/healthspan.ts)):

- Steps: Saint-Maurice et al., *JAMA* 2020; Paluch et al., *Lancet Public Health* 2022
- Resting heart rate: Zhang et al., *CMAJ* 2016
- Cardiorespiratory fitness (VO₂ max): Kodama et al., *JAMA* 2009; Mandsager et al., *JAMA Netw Open* 2018
- Sleep duration: Cappuccio et al., *Sleep* 2010
- Sleep regularity: Windred et al., *Sleep* 2024
- Strength training: Momma et al., *Br J Sports Med* 2022
- Weekly activity minutes: Arem et al., *JAMA Intern Med* 2015

The result is a conversation starter and a way to rank your habits, not a diagnosis. Treat the direction and the "biggest levers" as more useful than the exact age.

## Insights

Insights are generated by comparing parts of your own history, then phrased with practical steps. Examples:

- **Bedtime effect:** recovery after your earlier nights vs later nights (median split), when the gap is meaningful.
- **Hard-day cost:** HRV after strain-14+ days vs other days.
- **Evening workouts:** time to fall asleep and deep sleep after workouts that start at 7 PM or later.
- **Sleep debt, schedule drift, efficiency, deep/REM share, HRV and resting-HR trends.**
- **Illness / overreach flag:** several markers off baseline together (resting HR, breathing rate, SpO₂, skin temperature).
- **Daytime stress pattern** and the hour it peaks.
- **Your recovery recipe:** your best vs worst quarter of mornings compared on the night before.

An insight only appears when your data supports it. Many pattern insights need 2-4 weeks of history. The same numbers feed the optional AI coach.

## Weekly review

A deterministic summary of the last 7 days vs the previous 7: what improved, what slipped, your best and toughest day, and one focus for next week taken from the most actionable insight or your biggest Pulse Age lever.

## Privacy model

Your data lives in your own Neon database. The app is protected by a single password (a signed, HTTP-only session cookie). Nothing is sent anywhere else except:

- the optional **AI coach**: a short summary of recent numbers (no names, no raw samples) is sent to Groq to write a reply;
- optional **notifications**: short text (such as "Recovery 74%") goes through ntfy.

## Adding or changing a metric

- Fetching and normalizing Google data: [`src/lib/health.ts`](../src/lib/health.ts). Response shapes are extracted tolerantly with `pick()`, and each metric reports its status to the Data health screen.
- Scores and insights: [`src/lib/scores.ts`](../src/lib/scores.ts), [`src/lib/healthspan.ts`](../src/lib/healthspan.ts), [`src/lib/weekly.ts`](../src/lib/weekly.ts).
- Demo data (used for screenshots and `npm run demo`): [`src/lib/demo.ts`](../src/lib/demo.ts).
- UI: plain JavaScript in `public/` (no build step for the front end).
