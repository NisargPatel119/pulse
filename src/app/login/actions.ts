'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, createSessionToken } from '@/lib/session';

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  if (!process.env.APP_PASSWORD) return { error: 'APP_PASSWORD is not configured on the server.' };
  if (!(await checkPassword(String(formData.get('password') ?? '')))) {
    await new Promise(r => setTimeout(r, 1000));
    return { error: 'Incorrect password.' };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE,
  });
  redirect('/');
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
