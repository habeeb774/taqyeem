import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';
import { pool } from '@/db';

const schema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS' }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const emailHash = createHash('sha256').update(email).digest('hex');
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null;
  const userAgent = req.headers.get('user-agent');

  try {
    const recent = ip
      ? await pool.query(`select count(*)::int count from public.login_attempts where email_hash=$1 and success=false and created_at>=now()-interval '15 minutes' and ip_address=$2::inet`, [emailHash, ip])
      : await pool.query(`select count(*)::int count from public.login_attempts where email_hash=$1 and success=false and created_at>=now()-interval '15 minutes'`, [emailHash]);
    if (Number((recent.rows[0] as any)?.count || 0) >= 5) {
      return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 });
    }
  } catch { /* login-attempt logging must not block authentication */ }

  try {
    // Auth.js sets the signed session cookie on the response context.
    await signIn('credentials', { email, password, redirect: false });

    // Do not immediately re-read the just-written cookie. Resolve the authenticated
    // account by the already validated credential identity to avoid a race in route handlers.
    const result = await pool.query(
      `select id,name,email,employee_id,organization_id,active from public.users where lower(email)=lower($1) limit 1`,
      [email],
    );
    const user = result.rows[0] as any;
    if (!user?.active || !user.organization_id) throw Object.assign(new Error('ACCOUNT_NOT_READY'), { status: 403 });

    try {
      await pool.query(
        `insert into public.login_attempts(email_hash,ip_address,success,user_id,user_agent) values($1,$2::inet,true,$3::uuid,$4)`,
        [emailHash, ip, user.id, userAgent],
      );
      await pool.query(
        `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,ip_address,user_agent) values($1::uuid,$2::uuid,'auth.login','user',$2::uuid,$3::inet,$4)`,
        [user.organization_id, user.id, ip, userAgent],
      );
    } catch { /* audit failure must not invalidate a valid login */ }

    const appToken=randomBytes(32).toString('hex');await pool.query(`delete from public.sessions where expires<=now()`);await pool.query(`insert into public.sessions(session_token,user_id,expires) values($1,$2::uuid,now()+interval '30 days')`,[appToken,user.id]);const response=NextResponse.json({ ok: true, user: { id: String(user.id), name: user.name || user.email, email: user.email, employee_id: user.employee_id } }, {headers:{'Cache-Control':'no-store'}});response.cookies.set('taqyeem_session',appToken,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*30});return response;
  } catch (error: any) {
    try {
      await pool.query(
        `insert into public.login_attempts(email_hash,ip_address,success,user_agent) values($1,$2::inet,false,$3)`,
        [emailHash, ip, userAgent],
      );
    } catch { /* ignore logging errors */ }

    const accountNotReady = error?.message === 'ACCOUNT_NOT_READY';
    const authFailure = error instanceof AuthError || error?.type === 'CredentialsSignin';
    return NextResponse.json(
      { ok: false, error: accountNotReady ? 'ACCOUNT_NOT_READY' : 'INVALID_CREDENTIALS' },
      { status: accountNotReady ? 403 : (authFailure ? 401 : 401) },
    );
  }
}
