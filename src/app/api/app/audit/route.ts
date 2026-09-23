import { NextRequest, NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';

function errorResponse(error: unknown) {
  const result = jsonError(error);
  return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'audit_logs.view');

    const limit = Math.min(
      200,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 50)),
    );
    const result = await pool.query(
      `select a.id,a.action,a.entity_type,a.entity_id,a.reason,a.created_at,a.user_id,
              coalesce(u.name,p.full_name) user_name,
              coalesce(u.email,p.email) user_email
       from public.audit_logs a
       left join public.users u on u.id=a.user_id
       left join public.profiles p on p.id=a.user_id
       where a.organization_id=$1::uuid
       order by a.created_at desc
       limit $2`,
      [context.organizationId, limit],
    );

    return NextResponse.json({ ok: true, logs: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}
