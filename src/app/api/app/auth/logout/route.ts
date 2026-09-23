import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { signOut } from '@/auth';
import { pool } from '@/db';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get('taqyeem_session')?.value;

  if (token) {
    await pool
      .query('delete from public.sessions where session_token = $1', [token])
      .catch(() => undefined);
  }

  await signOut({ redirect: false });

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('taqyeem_session');
  return response;
}
