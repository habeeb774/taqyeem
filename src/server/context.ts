import { auth } from '@/auth';
import { cookies } from 'next/headers';
import { pool } from '@/db';
import {
  assertEmployeeAccess,
  can,
  canAccessEmployee,
  loadSecurityContext,
  must,
  type SecurityContext,
} from '@/db/queries/security';

export async function requireUser(): Promise<SecurityContext> {
  const session = await auth();
  const id = (session?.user as any)?.id;
  if (!id) {
    const token = (await cookies()).get('taqyeem_session')?.value;
    if (token) {
      const result = await pool.query(
        `select u.id
         from public.sessions s
         join public.users u on u.id=s.user_id
         where s.session_token=$1 and s.expires>now() and u.active=true
         limit 1`,
        [token],
      );
      if (result.rows[0]) return loadSecurityContext(String(result.rows[0].id));
    }
    throw Object.assign(new Error('UNAUTHENTICATED'), { status: 401 });
  }
  return loadSecurityContext(String(id));
}

export { assertEmployeeAccess, can, canAccessEmployee, must };

export function jsonError(error: unknown) {
  const err = error as any;
  const status = Number(err?.status)
    || (/UNAUTHENTICATED/.test(String(err?.message)) ? 401 : /FORBIDDEN/.test(String(err?.message)) ? 403 : 400);

  if (err?.name === 'ZodError') return { status: 400, error: 'تحقق من الحقول المدخلة' };
  return { status, error: String(err?.message || 'ERROR') };
}
