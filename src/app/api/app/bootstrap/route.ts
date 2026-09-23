import { NextRequest, NextResponse } from 'next/server';

import { pool } from '@/db';
import { visibleEmployees } from '@/db/queries/security';
import { can, jsonError, requireUser } from '@/server/context';

const emptyRows = Promise.resolve({ rows: [] } as any);

function readSearchParams(req: NextRequest) {
  const url = new URL(req.url);

  return {
    limit: Number(url.searchParams.get('limit') || 100),
    offset: Number(url.searchParams.get('offset') || 0),
    search: url.searchParams.get('search') || '',
    cycleId: url.searchParams.get('cycle_id'),
  };
}

function resolveVisibility(context: Awaited<ReturnType<typeof requireUser>>) {
  return {
    employees:
      can(context, 'employees.view') ||
      can(context, 'employees.create') ||
      can(context, 'employees.update') ||
      can(context, 'evaluations.view') ||
      can(context, 'evaluations.edit'),
    evaluations:
      can(context, 'evaluations.view') ||
      can(context, 'evaluations.create') ||
      can(context, 'evaluations.edit') ||
      can(context, 'evaluations.submit') ||
      can(context, 'criteria.manage'),
    attendance: can(context, 'attendance.view') || can(context, 'attendance.manage'),
  };
}

function queryJobTitles(organizationId: string, enabled: boolean) {
  if (!enabled) return emptyRows;

  return pool.query(
    `
      select id, name, code, active
      from public.job_titles
      where organization_id = $1::uuid
        and deleted_at is null
      order by name
    `,
    [organizationId],
  );
}

function queryCycles(organizationId: string, enabled: boolean) {
  if (!enabled) return emptyRows;

  return pool.query(
    `
      select id, name, month, year, status, starts_at, ends_at
      from public.evaluation_cycles
      where organization_id = $1::uuid
      order by year desc, month desc
    `,
    [organizationId],
  );
}

function queryCriteria(organizationId: string, enabled: boolean) {
  if (!enabled) return emptyRows;

  return pool.query(
    `
      select
        id,
        code,
        name,
        description,
        max_score,
        mandatory,
        visible_to_employee,
        comment_required,
        active
      from public.evaluation_criteria
      where organization_id = $1::uuid
        and active = true
      order by code
    `,
    [organizationId],
  );
}

function queryRatings(organizationId: string, enabled: boolean) {
  if (!enabled) return emptyRows;

  return pool.query(
    `
      select id, value, label, sort_order, active
      from public.rating_scale_items
      where organization_id = $1::uuid
        and active = true
      order by sort_order
    `,
    [organizationId],
  );
}

function queryPenalties(organizationId: string, enabled: boolean) {
  if (!enabled) return emptyRows;

  return pool.query(
    `
      select id, code, name, description, deduction_points, active
      from public.attendance_penalty_types
      where organization_id = $1::uuid
        and active = true
      order by name
    `,
    [organizationId],
  );
}

function querySettings(organizationId: string) {
  return pool.query(
    `
      select key, value
      from public.system_settings
      where organization_id = $1::uuid
        and key = any($2::text[])
    `,
    [
      organizationId,
      ['sales_target_default', 'branch_target_mode', 'employee_portal_visibility'],
    ],
  );
}

function queryAssignments(userId: string, employeeIds: string[], cycleId: string | null) {
  if (!employeeIds.length) return emptyRows;

  const cycleFilter = cycleId ? 'and cycle_id = $3::uuid' : '';
  return pool.query(
    `
      select id, cycle_id, employee_id, evaluation_type, template_id, due_at
      from public.evaluation_assignments
      where evaluator_user_id = $1::uuid
        and employee_id = any($2::uuid[])
        ${cycleFilter}
    `,
    cycleId ? [userId, employeeIds, cycleId] : [userId, employeeIds],
  );
}

function queryEvaluations(userId: string, employeeIds: string[], cycleId: string | null) {
  if (!employeeIds.length) return emptyRows;

  const cycleFilter = cycleId ? 'and cycle_id = $3::uuid' : '';
  return pool.query(
    `
      select
        id,
        assignment_id,
        cycle_id,
        employee_id,
        evaluation_type,
        status,
        weighted_score,
        final_score,
        result_label,
        notes,
        submitted_at,
        published_at,
        template_snapshot
      from public.evaluations
      where evaluator_user_id = $1::uuid
        and employee_id = any($2::uuid[])
        ${cycleFilter}
    `,
    cycleId ? [userId, employeeIds, cycleId] : [userId, employeeIds],
  );
}

function queryTargets(employeeIds: string[], cycleId: string | null) {
  if (!employeeIds.length) return emptyRows;

  const cycleFilter = cycleId ? 'and cycle_id = $2::uuid' : '';
  return pool.query(
    `
      select
        id,
        cycle_id,
        employee_id,
        target_amount,
        achieved_amount,
        last_edit_reason,
        source
      from public.sales_targets
      where employee_id = any($1::uuid[])
        ${cycleFilter}
    `,
    cycleId ? [employeeIds, cycleId] : [employeeIds],
  );
}

function queryAttendance(employeeIds: string[], cycleId: string | null) {
  if (!employeeIds.length) return emptyRows;

  const cycleFilter = cycleId ? 'and cycle_id = $2::uuid' : '';
  return pool.query(
    `
      select
        id,
        cycle_id,
        employee_id,
        base_score,
        final_score,
        notes,
        status,
        updated_at
      from public.attendance_evaluations
      where employee_id = any($1::uuid[])
        ${cycleFilter}
    `,
    cycleId ? [employeeIds, cycleId] : [employeeIds],
  );
}

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    const { limit, offset, search, cycleId } = readSearchParams(req);

    const employees = await visibleEmployees(context, { limit, offset, search });
    const employeeIds = employees.rows.map((employee: any) => employee.id);
    const visibility = resolveVisibility(context);

    const [
      titles,
      cycles,
      criteria,
      ratings,
      penalties,
      settings,
      assignments,
      evaluations,
      targets,
      attendance,
    ] = await Promise.all([
      queryJobTitles(context.organizationId, visibility.employees),
      queryCycles(context.organizationId, visibility.evaluations),
      queryCriteria(context.organizationId, visibility.evaluations),
      queryRatings(context.organizationId, visibility.evaluations),
      queryPenalties(context.organizationId, visibility.attendance),
      querySettings(context.organizationId),
      queryAssignments(context.user.id, employeeIds, cycleId),
      queryEvaluations(context.user.id, employeeIds, cycleId),
      queryTargets(employeeIds, cycleId),
      queryAttendance(employeeIds, cycleId),
    ]);

    return NextResponse.json({
      ok: true,
      user: {
        id: context.user.id,
        name: context.user.name || context.user.email,
        email: context.user.email,
        employee_id: context.user.employeeId,
      },
      roles: context.roles,
      permissions: context.permissions,
      scopes: context.scopes,
      employees: employees.rows,
      employee_pagination: {
        total: employees.total,
        limit: employees.limit,
        offset: employees.offset,
        has_more: employees.hasMore,
      },
      job_titles: titles.rows,
      cycles: cycles.rows,
      criteria: criteria.rows,
      ratings: ratings.rows,
      penalties: penalties.rows,
      settings: Object.fromEntries(
        settings.rows.map((row: any) => [row.key, row.value]),
      ),
      assignments: assignments.rows,
      evaluations: evaluations.rows,
      targets: targets.rows,
      attendance: attendance.rows,
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
