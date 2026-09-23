import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { visibleEmployees } from '@/db/queries/security';
import { jsonError, must, requireUser } from '@/server/context';

type DesignScope = {
  organizationScope: boolean;
  branchIds: string[];
  departmentIds: string[];
  assigned: boolean;
};

function resolveDesignScope(context: Awaited<ReturnType<typeof requireUser>>) {
  return {
    organizationScope: context.scopes.some((scope) => scope.type === 'organization'),
    branchIds: context.scopes
      .filter((scope) => scope.type === 'branch' && scope.id)
      .map((scope) => scope.id!),
    departmentIds: context.scopes
      .filter((scope) => scope.type === 'department' && scope.id)
      .map((scope) => scope.id!),
    assigned: context.scopes.some((scope) => scope.type === 'assigned_employees'),
  };
}

function scopeArgs(
  context: Awaited<ReturnType<typeof requireUser>>,
  scope: DesignScope,
) {
  return [
    context.organizationId,
    scope.organizationScope,
    scope.branchIds,
    scope.departmentIds,
    scope.assigned,
    context.user.id,
    context.user.employeeId,
  ];
}

const employeeScopeSql = `
  (
    $2::boolean
    or (
      cardinality($3::uuid[]) > 0
      and e.branch_id = any($3::uuid[])
    )
    or (
      cardinality($4::uuid[]) > 0
      and e.department_id = any($4::uuid[])
    )
    or (
      $5::boolean
      and exists (
        select 1
        from public.evaluation_assignments a
        where a.employee_id = e.id
          and a.evaluator_user_id = $6::uuid
      )
    )
    or (
      $7::uuid is not null
      and (
        e.id = $7::uuid
        or e.manager_id = $7::uuid
        or e.supervisor_id = $7::uuid
      )
    )
  )
`;

function queryDepartments(args: unknown[]) {
  return pool.query(
    `
      select distinct d.id, d.name
      from public.departments d
      left join public.employees e
        on e.department_id = d.id
       and e.deleted_at is null
      where d.organization_id = $1::uuid
        and d.active = true
        and (
          $2::boolean
          or d.id = any($4::uuid[])
          or exists (
            select 1
            from public.employees e
            where e.department_id = d.id
              and e.organization_id = $1::uuid
              and e.deleted_at is null
              and ${employeeScopeSql}
          )
        )
      order by d.name
    `,
    args,
  );
}

function queryBranches(args: unknown[]) {
  return pool.query(
    `
      select distinct b.id, b.name
      from public.branches b
      left join public.employees e
        on e.branch_id = b.id
       and e.deleted_at is null
      where b.organization_id = $1::uuid
        and b.active = true
        and (
          $2::boolean
          or b.id = any($3::uuid[])
          or exists (
            select 1
            from public.departments d
            where d.branch_id = b.id
              and d.id = any($4::uuid[])
          )
          or exists (
            select 1
            from public.employees e
            where e.branch_id = b.id
              and e.organization_id = $1::uuid
              and e.deleted_at is null
              and ${employeeScopeSql}
          )
        )
      order by b.name
    `,
    args,
  );
}

function queryJobTitles(args: unknown[]) {
  return pool.query(
    `
      select distinct j.id, j.name
      from public.job_titles j
      join public.employees e
        on e.job_title_id = j.id
       and e.deleted_at is null
      where j.organization_id = $1::uuid
        and e.organization_id = $1::uuid
        and j.active = true
        and ${employeeScopeSql}
      order by j.name
    `,
    args,
  );
}

export async function GET() {
  try {
    const context = await requireUser();
    must(context, 'design_templates.use');

    const employees = await visibleEmployees(context, { limit: 200 });
    const scope = resolveDesignScope(context);
    const args = scopeArgs(context, scope);

    const [departments, branches, jobTitles] = await Promise.all([
      queryDepartments(args),
      queryBranches(args),
      queryJobTitles(args),
    ]);

    return NextResponse.json({
      ok: true,
      employees: employees.rows,
      departments: departments.rows,
      branches: branches.rows,
      job_titles: jobTitles.rows,
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
