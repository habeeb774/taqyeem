import { NextRequest, NextResponse } from 'next/server';

import { pool } from '@/db';
import { allVisibleEmployees, visibleEmployees } from '@/db/queries/security';
import { can, jsonError, requireUser } from '@/server/context';

function errorResponse(error: unknown) {
  const result = jsonError(error);
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: result.status },
  );
}

type FormEmployeeRow = {
  id: string;
  employee_number: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  branch_id: string | null;
  department_id: string | null;
  job_title_id: string | null;
  branch_name?: string | null;
  department_name?: string | null;
  job_title_name?: string | null;
  manager_id: string | null;
  manager_name?: string | null;
};

type LookupRow = {
  id: string;
  name: string;
  code: string | null;
};

type DepartmentLookupRow = LookupRow & {
  branch_id: string | null;
};

function compactEmployee(employee: FormEmployeeRow) {
  return {
    id: employee.id,
    employee_number: employee.employee_number,
    full_name: employee.full_name,
    email: employee.email,
    phone: employee.phone,
    status: employee.status,
    branch_id: employee.branch_id,
    department_id: employee.department_id,
    job_title_id: employee.job_title_id,
    branch_name: employee.branch_name || '',
    department_name: employee.department_name || '',
    job_title_name: employee.job_title_name || '',
    manager_id: employee.manager_id,
    manager_name: employee.manager_name || '',
  };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser();
    if (!can(context, 'forms.view') && !can(context, 'forms.create')) {
      throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
    }

    const query = request.nextUrl.searchParams;
    const search = query.get('q') || '';
    const limit = Math.min(Number(query.get('limit') || 20), 50);

    if (query.get('lookups') === '1') {
      const visible = (await allVisibleEmployees(context)) as FormEmployeeRow[];
      const branchIds = [...new Set(visible.map((employee) => employee.branch_id).filter(Boolean))];
      const departmentIds = [
        ...new Set(visible.map((employee) => employee.department_id).filter(Boolean)),
      ];
      const [branches, departments] = await Promise.all([
        branchIds.length
          ? pool.query<LookupRow>(
              `select id,name,code
               from public.branches
               where organization_id=$1::uuid and id=any($2::uuid[]) and active=true
               order by name`,
              [context.organizationId, branchIds],
            )
          : { rows: [] },
        departmentIds.length
          ? pool.query<DepartmentLookupRow>(
              `select id,name,code,branch_id
               from public.departments
               where organization_id=$1::uuid and id=any($2::uuid[]) and active=true
               order by name`,
              [context.organizationId, departmentIds],
            )
          : { rows: [] },
      ]);

      return NextResponse.json({
        ok: true,
        branches: branches.rows,
        departments: departments.rows,
      });
    }

    const result = await visibleEmployees(context, { limit, offset: 0, search });
    return NextResponse.json({
      ok: true,
      employees: (result.rows as FormEmployeeRow[]).map(compactEmployee),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
