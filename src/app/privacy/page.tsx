import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pulse privacy policy',
  description: 'How Pulse handles the health data you connect to it.',
};

const h2 = { fontSize: 20, margin: '32px 0 8px' } as const;
const p = { margin: '0 0 12px', lineHeight: 1.65 } as const;

// Public page (no sign-in): Google requires a reachable privacy policy for the OAuth consent screen.
export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px 80px', font: '16px/1.6 system-ui, sans-serif', color: '#e8ebf0', background: '#0e1013', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 32, margin: '0 0 4px' }}>Pulse privacy policy</h1>
      <p style={{ ...p, color: '#8b93a1' }}>Last updated: November 4, 2026</p>

      <p style={p}>
        Pulse is a personal health dashboard built and run by one individual for their own use. It shows recovery, sleep, activity and
        similar insights from data in the owner&apos;s own Google Health account. It has no advertising, no public sign-up, and no user
        accounts other than the owner&apos;s.
      </p>

      <h2 style={h2}>What data Pulse accesses</h2>
      <p style={p}>
        When the owner connects their Google account, Pulse requests <strong>read-only</strong> access to Google Health API data: sleep,
        heart rate and heart rate variability, resting heart rate, blood oxygen, breathing rate, skin temperature, steps, active minutes,
        workouts, VO₂ max, and basic profile information. Pulse never writes to or changes the Google Health account.
      </p>

      <h2 style={h2}>How the data is used</h2>
      <p style={p}>
        The data is used only to calculate and display the owner&apos;s own scores, charts and insights inside Pulse. It is not sold,
        not shared with third parties for their own purposes, not used for advertising, and not used to train AI models.
      </p>

      <h2 style={h2}>Where the data is stored</h2>
      <p style={p}>
        Data is stored in a private database controlled by the owner and served by a private deployment on Vercel. Access to the app is
        protected by a password. The Google login token is kept in that same database.
      </p>

      <h2 style={h2}>Optional services</h2>
      <p style={p}>
        If enabled by the owner: (1) an AI coach, which sends a short summary of recent numbers to Groq to generate a written reply; and
        (2) notifications, which send short messages such as a recovery percentage or a bedtime reminder through the ntfy notification
        service. Neither is used for any other purpose.
      </p>

      <h2 style={h2}>Retention and deletion</h2>
      <p style={p}>
        Data stays until the owner deletes it. Choosing <em>Disconnect</em> in Pulse&apos;s settings removes the stored health data and
        the Google login token. Access can also be revoked at any time at{' '}
        <a href="https://myaccount.google.com/permissions" style={{ color: '#56B4E9' }}>myaccount.google.com/permissions</a>.
      </p>

      <h2 style={h2}>Google API Services User Data Policy</h2>
      <p style={p}>
        Pulse&apos;s use and transfer of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: '#56B4E9' }}>
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2 style={h2}>Not medical advice</h2>
      <p style={p}>
        Pulse provides general wellness estimates only. It is not a medical device and does not diagnose, treat or prevent any condition.
      </p>

      <h2 style={h2}>Contact</h2>
      <p style={p}>Questions about this policy can be sent to the app owner at the support email shown on the Google sign-in consent screen.</p>
    </main>
  );
}
