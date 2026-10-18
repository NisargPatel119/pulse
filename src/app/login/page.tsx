'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, font: '16px system-ui, sans-serif', color: '#e8ebf0' }}>
      <form action={action} style={{ width: '100%', maxWidth: 360, background: '#171a20', border: '1px solid #252a33', borderRadius: 16, padding: 28, display: 'grid', gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Pulse</h1>
        {/* Hidden username helps iOS/password managers save the credential */}
        <input type="text" name="username" autoComplete="username" defaultValue="me" hidden readOnly />
        <input name="password" type="password" autoComplete="current-password" placeholder="Password" required autoFocus
          style={{ background: '#0e1013', color: 'inherit', border: '1px solid #252a33', borderRadius: 10, padding: '12px 14px', fontSize: 16 }} />
        {state?.error && <p role="alert" style={{ margin: 0, color: '#f87171', fontSize: 14 }}>{state.error}</p>}
        <button disabled={pending} style={{ background: '#34d399', color: '#04130d', border: 0, borderRadius: 10, padding: 12, fontSize: 16, fontWeight: 600 }}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
