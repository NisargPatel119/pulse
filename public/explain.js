// Tap-to-explain content: what each score is, how Pulse computes it, healthy ranges, and what moves it.
const EXPLAIN = {
  recovery: {
    title: 'Recovery',
    what: 'How ready your body is to take on strain today, from 0 to 100%.',
    how: 'Compares last night\'s HRV, resting heart rate, breathing rate, blood oxygen and skin temperature with your own 28-day baseline, then blends in how well you slept. HRV carries the most weight (50%), then resting heart rate (25%) and sleep (15%).',
    ranges: [['67–100%', 'Primed: push hard'], ['34–66%', 'Moderate: train steady'], ['0–33%', 'Low: prioritize rest']],
    moves: ['Consistent bed and wake times', 'Enough sleep (7.5h+)', 'Alcohol, late meals and heat lower it', 'Hard training days lower it the next morning', 'Illness and stress show up here first'],
  },
  sleep: {
    title: 'Sleep performance',
    what: 'How well last night met your needs, from 0 to 100%.',
    how: 'Duration vs your sleep need (50%), efficiency, meaning time asleep out of time in bed (20%), restorative sleep, meaning deep plus REM as a share of sleep (20%), and bedtime consistency vs the previous week (10%).',
    ranges: [['85–100%', 'Excellent'], ['70–84%', 'Good'], ['50–69%', 'Fair'], ['Under 50%', 'Poor']],
    moves: ['Go to bed at a consistent time', 'Keep the room cool and dark', 'Limit caffeine after noon and alcohol near bedtime', 'Avoid screens in the last hour'],
  },
  strain: {
    title: 'Strain',
    what: 'How much load your body took on today, on a 0–21 scale.',
    how: 'The scale is logarithmic: the first points come easily and the top end takes a lot. When heart-rate data is available it is built from time in heart-rate zones (higher zones count more); otherwise it is estimated from steps, active zone minutes and workouts. Your target range depends on today\'s recovery.',
    ranges: [['0–9', 'Light'], ['10–13', 'Moderate'], ['14–17', 'High'], ['18–21', 'All out']],
    moves: ['Match strain to recovery: go hard when primed, ease off when low', 'Alternate hard and easy days'],
  },
  hrv: {
    title: 'Heart rate variability (HRV)',
    what: 'The variation in time between heartbeats, measured overnight in milliseconds.',
    how: 'Fitbit reports an overnight HRV (RMSSD). Higher generally means a more recovered, adaptable nervous system. It is very personal: compare yourself to your own baseline, not to other people.',
    ranges: [['Above your usual', 'Well recovered'], ['Near your usual', 'Normal'], ['Well below your usual', 'Stress, illness or under-recovery']],
    moves: ['Sleep and a steady schedule', 'Alcohol lowers it sharply', 'Regular aerobic exercise raises it over weeks', 'Slow breathing (inhale 4s, exhale 6s)'],
  },
  rhr: {
    title: 'Resting heart rate',
    what: 'Your lowest sustained heart rate, usually overnight, in beats per minute.',
    how: 'Lower is generally better and reflects cardiovascular fitness. A rise of 4+ bpm over your baseline can signal fatigue, dehydration, alcohol or oncoming illness.',
    ranges: [['Under 60', 'Typically fit'], ['60–70', 'Typical'], ['Over 70', 'Higher mortality risk with age (research)']],
    moves: ['Zone 2 cardio 3 times a week', 'Good hydration', 'Less alcohol', 'Quality sleep'],
  },
  spo2: {
    title: 'Blood oxygen (SpO₂)',
    what: 'The share of your blood carrying oxygen, measured while you sleep.',
    how: 'Healthy overnight values are usually 94–99%. Repeated readings under 92% are worth mentioning to a clinician. A loose band can also read low.',
    ranges: [['95–100%', 'Normal'], ['92–94%', 'Slightly low'], ['Under 92%', 'Worth a check if repeated']],
    moves: ['Wear the band snugly', 'Treat nasal congestion', 'Side-sleeping can help'],
  },
  steps: {
    title: 'Steps',
    what: 'Steps counted so far today.',
    how: 'Mortality benefit rises up to roughly 8,000–12,000 steps a day, then flattens (published research). Pulse uses 8,000 as the reference goal.',
    ranges: [['Under 5,000', 'Low'], ['5,000–8,000', 'Okay'], ['8,000+', 'Good'], ['10,000+', 'Near the plateau of benefit']],
    moves: ['Short walks after meals', 'Take calls on foot', 'Park farther away'],
  },
  stress: {
    title: 'Daytime stress',
    what: 'How elevated your heart rate is while you are sitting still, on a 0–3 scale.',
    how: 'Pulse compares your heart rate during awake, sedentary periods (no steps nearby) with your resting heart rate. A higher gap means your body is working harder than the situation needs: stress, caffeine, poor sleep or illness. It is a heart-rate-based estimate, not a clinical stress test.',
    ranges: [['0–1', 'Low'], ['1–2', 'Moderate'], ['2–3', 'High']],
    moves: ['Slow breathing for 2 minutes', 'A short walk', 'Less caffeine', 'More sleep'],
  },
  temp: {
    title: 'Skin temperature',
    what: 'How warm your skin runs overnight compared with your own baseline.',
    how: 'Your Fitbit measures temperature while you sleep and compares it with a personal baseline built from your previous nights. Pulse shows the difference. It is a trend signal, not a fever thermometer.',
    ranges: [['Within ±0.5°C (±0.9°F)', 'Normal'], ['+0.5 to +0.8°C', 'A bit warm'], ['Above +0.8°C (+1.4°F)', 'Elevated: often illness, alcohol, a warm room or a cycle phase'], ['Below −0.5°C', 'Cooler than usual']],
    moves: ['Room temperature and bedding', 'Alcohol raises it', 'Illness or the start of a fever', 'Menstrual cycle phase', 'Hot showers or late workouts'],
  },
  healthspan: {
    title: 'Pulse Age',
    what: 'An estimate of your biological age from your sleep, activity and heart fitness.',
    how: 'Each habit maps to published all-cause mortality research and is converted to years, with a correction so overlapping habits are not double counted. Age uses up to 6 months of data; pace compares your last 30 days with that baseline. Modeled on how WHOOP describes Healthspan, but not its proprietary model and not a medical test.',
    ranges: [['Pace under 1x', 'Aging slower than the calendar'], ['Pace about 1x', 'Aging at calendar pace'], ['Pace over 1x', 'Aging faster']],
    moves: ['Hit about 10,000 steps', 'Keep sleep 7–8h and consistent', 'Build cardio fitness (VO₂ max)', 'Strength train weekly'],
  },
};

function openExplain(key) {
  const e = EXPLAIN[key];
  if (!e) return;
  const ranges = e.ranges.map(([a, b]) => `<tr><td><b>${a}</b></td><td>${b}</td></tr>`).join('');
  $('explain-body').innerHTML = `<p class="exp-what">${e.what}</p>
    <div class="dolabel">How Pulse calculates it</div><p class="exp-p">${e.how}</p>
    <div class="dolabel">What the numbers mean</div><table class="tbl exp-tbl"><tbody>${ranges}</tbody></table>
    <div class="dolabel">What moves it</div><ul class="steps" style="--c:var(--accent)">${e.moves.map((m) => `<li>${m}</li>`).join('')}</ul>`;
  $('explain-title').textContent = e.title;
  $('explain').showModal();
}
const ib = (key) => `<button class="info-btn" data-explain="${key}" aria-label="About ${EXPLAIN[key]?.title || key}">i</button>`;
