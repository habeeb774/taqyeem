import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { withNeonTransaction } from '@/lib/neon/admin';
import { assertEmployeeAccess, jsonError, must, requireUser } from '@/server/context';

const saveTargetSchema = z.object({
  cycle_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  target: z.number().positive(),
  achieved: z.number().min(0),
  reason: z.string().optional(),
});

function errorResponse(error: unknown) {
  const result = jsonError(error);
  return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'targets.view');

    const cycleId = request.nextUrl.searchParams.get('cycle_id');
    const result = await pool.query(
      `select t.*
       from public.sales_targets t
       join public.employees e on e.id=t.employee_id
       where e.organization_id=$1::uuid
         and ($2::uuid is null or t.cycle_id=$2::uuid)
       order by t.updated_at desc
       limit 500`,
      [context.organizationId, cycleId || null],
    );

    const allowed = [];
    for (const target of result.rows as any[]) {
      try {
        await assertEmployeeAccess(context, String(target.employee_id));
        allowed.push(target);
      } catch {
        // The target exists, but this user is not allowed to see its employee.
      }
    }

    return NextResponse.json({ ok: true, targets: allowed });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'targets.manage');

    const value = saveTargetSchema.parse(await request.json());
    await assertEmployeeAccess(context, value.employee_id);

    const existing = await pool.query(
      `select id,target_amount
       from public.sales_targets
       where cycle_id=$1::uuid and employee_id=$2::uuid`,
      [value.cycle_id, value.employee_id],
    );
    const targetChanged = existing.rows[0]
      && Number((existing.rows[0] as any).target_amount) !== value.target;
    if (targetChanged && String(value.reason || '').trim().length < 3) {
      throw new Error('target_change_reason_required');
    }

    let targetId = '';
    await withNeonTransaction(async (transaction) => {
      const employee = await transaction.query(
        `select branch_id,department_id
         from public.employees
         where id=$1::uuid and organization_id=$2::uuid`,
        [value.employee_id, context.organizationId],
      );
      if (!employee.rows[0]) throw new Error('INVALID_EMPLOYEE');

      const saved = await transaction.query(
        `insert into public.sales_targets(
           organization_id,cycle_id,employee_id,branch_id,department_id,target_amount,
           achieved_amount,source,last_edit_reason,created_by,updated_by
         ) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7,'individual',$8,$9::uuid,$9::uuid)
         on conflict(cycle_id,employee_id) do update set
           target_amount=excluded.target_amount,
           achieved_amount=excluded.achieved_amount,
           last_edit_reason=excluded.last_edit_reason,
           updated_by=$9::uuid,
           updated_at=now()
         returning id`,
        [
          context.organizationId,
          value.cycle_id,
          value.employee_id,
          employee.rows[0].branch_id || null,
          employee.rows[0].department_id || null,
          value.target,
          value.achieved,
          value.reason || null,
          context.user.id,
        ],
      );
      targetId = String(saved.rows[0].id);

      await transaction.query(
        `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values,reason)
         values($1::uuid,$2::uuid,'target.upsert','sales_target',$3::uuid,$4::jsonb,$5)`,
        [
          context.organizationId,
          context.user.id,
          targetId,
          JSON.stringify({ target: value.target, achieved: value.achieved }),
          value.reason || null,
        ],
      );
    });

    return NextResponse.json({ ok: true, id: targetId });
  } catch (error) {
    return errorResponse(error);
  }
}
