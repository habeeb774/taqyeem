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
  const message = String(err?.message || '');
  const known = new Set([
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'PROFILE_NOT_READY',
    'INVALID_ROLE',
    'INVALID_EMPLOYEE',
    'JOB_TITLE_NOT_FOUND',
    'ID_REQUIRED',
    'CANNOT_DISABLE_SELF',
    'target_change_reason_required',
    'NOT_FOUND',
    'CONSENT_REQUIRED',
    'CV_REQUIRED',
    'JOB_NOT_AVAILABLE',
    'DUPLICATE_APPLICATION',
    'UNSUPPORTED_CV_TYPE',
    'CV_TOO_LARGE',
    'RATE_LIMITED',
    'ORGANIZATION_NOT_FOUND',
    'SLUG_ALREADY_EXISTS',
    'OBJECT_STORAGE_NOT_CONFIGURED',
  ]);
  if (known.has(message)) return { status, error: message };
  return { status: status >= 500 ? status : 400, error: 'REQUEST_FAILED' };
}
