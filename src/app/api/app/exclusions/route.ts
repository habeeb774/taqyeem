import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import {
  assertEmployeeAccess,
  jsonError,
  must,
  requireUser,
} from '@/server/context';

type IdRow = { id: string };

type ExclusionRow = {
  id: string;
  cycle_id: string;
  employee_id: string;
  exclusion_type: string;
  reason: string;
  created_by: string | null;
  created_at: string;
};

const exclusionSchema = z.object({
  cycle_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  type: z.enum([
    'leave',
    'other_branch',
    'other_manager',
    'transferred',
    'not_required',
    'temporarily_suspended',
    'other',
  ]),
  reason: z.string().min(2),
});

function errorResponse(error: unknown) {
  const result = jsonError(error);
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: result.status },
  );
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'evaluations.view');

    const cycleId = z
      .string()
      .uuid()
      .parse(request.nextUrl.searchParams.get('cycle_id'));
    const result = await pool.query<ExclusionRow>(
      `select x.*
       from public.evaluation_exclusions x
       join public.employees e on e.id=x.employee_id
       where x.cycle_id=$1::uuid and e.organization_id=$2::uuid`,
      [cycleId, context.organizationId],
    );

    const exclusions: ExclusionRow[] = [];
    for (const exclusion of result.rows) {
      try {
        await assertEmployeeAccess(context, String(exclusion.employee_id));
        exclusions.push(exclusion);
      } catch {
        // Hidden because this user cannot access the excluded employee.
      }
    }

    return NextResponse.json({ ok: true, exclusions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'evaluations.edit');

    const value = exclusionSchema.parse(await request.json());
    await assertEmployeeAccess(context, value.employee_id);

    const result = await pool.query<IdRow>(
      `insert into public.evaluation_exclusions(cycle_id,employee_id,exclusion_type,reason,created_by)
       values($1::uuid,$2::uuid,$3,$4,$5::uuid)
       on conflict(cycle_id,employee_id) do update set
         exclusion_type=excluded.exclusion_type,
         reason=excluded.reason
       returning id`,
      [value.cycle_id, value.employee_id, value.type, value.reason, context.user.id],
    );

    return NextResponse.json({ ok: true, id: result.rows[0]?.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'evaluations.edit');

    const cycleId = z
      .string()
      .uuid()
      .parse(request.nextUrl.searchParams.get('cycle_id'));
    const employeeId = z
      .string()
      .uuid()
      .parse(request.nextUrl.searchParams.get('employee_id'));
    await assertEmployeeAccess(context, employeeId);

    await pool.query(
      `delete from public.evaluation_exclusions
       where cycle_id=$1::uuid and employee_id=$2::uuid`,
      [cycleId, employeeId],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
