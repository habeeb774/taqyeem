import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { jsonError, requireUser } from '@/server/context';

const markReadSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

function errorResponse(error: unknown) {
  const result = jsonError(error);
  return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}

export async function GET() {
  try {
    const context = await requireUser();
    const result = await pool.query(
      `select id,title,body,kind,entity_type,entity_id,read_at,created_at
       from public.notifications
       where user_id=$1::uuid and organization_id=$2::uuid
       order by created_at desc
       limit 100`,
      [context.user.id, context.organizationId],
    );

    return NextResponse.json({ ok: true, notifications: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireUser();
    const value = markReadSchema.parse(await request.json());
    if (!value.all && !value.id) throw new Error('ID_REQUIRED');

    if (value.all) {
      await pool.query(
        `update public.notifications
         set read_at=coalesce(read_at,now())
         where user_id=$1::uuid and organization_id=$2::uuid`,
        [context.user.id, context.organizationId],
      );
    } else {
      await pool.query(
        `update public.notifications
         set read_at=coalesce(read_at,now())
         where id=$1::uuid and user_id=$2::uuid and organization_id=$3::uuid`,
        [value.id, context.user.id, context.organizationId],
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
