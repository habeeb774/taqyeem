import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, requireUser } from '@/server/context';

function errorResponse(error: unknown) {
  const result = jsonError(error);
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: result.status },
  );
}

type EmployeePortalRow = {
  id: string;
  employee_number: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  job_title_name: string | null;
  job_titles?: { name: string } | null;
};

type CycleBackedRow = {
  cycle_name: string;
  month: number;
  year: number;
};

function cycleView<T extends CycleBackedRow>(row: T) {
  return {
    ...row,
    evaluation_cycles: {
      name: row.cycle_name,
      month: row.month,
      year: row.year,
    },
  };
}

export async function GET() {
  try {
    const context = await requireUser();
    const employeeId = context.user.employeeId;
    if (!employeeId) {
      return NextResponse.json({
        ok: true,
        employee: null,
        evaluations: [],
        targets: [],
        attendance: [],
      });
    }

    const [employeeResult, evaluations, targets, attendance] = await Promise.all([
      pool.query<EmployeePortalRow>(
        `select e.id,e.employee_number,e.full_name,e.email,e.phone,e.status,j.name job_title_name
         from public.employees e
         left join public.job_titles j on j.id=e.job_title_id
         where e.id=$1::uuid and e.organization_id=$2::uuid`,
        [employeeId, context.organizationId],
      ),
      pool.query<CycleBackedRow>(
        `select e.id,e.cycle_id,e.status,e.final_score,e.result_label,e.notes,e.published_at,
                e.template_snapshot,c.name cycle_name,c.month,c.year
         from public.evaluations e
         join public.evaluation_cycles c on c.id=e.cycle_id
         where e.employee_id=$1::uuid and e.status=any($2::text[])
         order by e.published_at desc nulls last`,
        [employeeId, ['published', 'locked']],
      ),
      pool.query<CycleBackedRow>(
        `select t.id,t.cycle_id,t.target_amount,t.achieved_amount,t.source,
                c.name cycle_name,c.month,c.year
         from public.sales_targets t
         join public.evaluation_cycles c on c.id=t.cycle_id
         where t.employee_id=$1::uuid
         order by t.updated_at desc`,
        [employeeId],
      ),
      pool.query<CycleBackedRow>(
        `select a.id,a.cycle_id,a.base_score,a.final_score,a.notes,a.status,a.published_at,
                c.name cycle_name,c.month,c.year
         from public.attendance_evaluations a
         join public.evaluation_cycles c on c.id=a.cycle_id
         where a.employee_id=$1::uuid and a.status=any($2::text[])
         order by a.updated_at desc`,
        [employeeId, ['published', 'locked']],
      ),
    ]);

    const employee = employeeResult.rows[0] || null;
    if (employee) {
      employee.job_titles = employee.job_title_name ? { name: employee.job_title_name } : null;
    }

    return NextResponse.json({
      ok: true,
      employee,
      evaluations: evaluations.rows.map(cycleView),
      targets: targets.rows.map(cycleView),
      attendance: attendance.rows.map(cycleView),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
