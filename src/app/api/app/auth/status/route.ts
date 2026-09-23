import { NextResponse } from 'next/server';

import { pool } from '@/db';

export const dynamic = 'force-dynamic';

async function hasConfiguredActiveUser() {
  const result = await pool.query(
    `
      select count(*)::int count
      from public.users
      where active = true
        and organization_id is not null
        and password_hash is not null
    `,
  );

  return Number((result.rows[0] as any)?.count || 0) > 0;
}

export async function GET() {
  try {
    const configured = await hasConfiguredActiveUser();

    return NextResponse.json(
      { ok: true, setup_required: !configured },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: String(error?.message || 'STATUS_FAILED') },
      { status: 500 },
    );
  }
}
