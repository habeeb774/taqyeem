import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { visibleEmployees } from '@/db/queries/security';
import { withNeonTransaction } from '@/lib/neon/admin';
import {
  assertEmployeeAccess,
  jsonError,
  must,
  requireUser,
} from '@/server/context';

const createSchema = z.object({
  full_name: z.string().trim().min(2),
  job_title_id: z.string().uuid().nullable().optional(),
  job_title_name: z.string().trim().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(2).optional(),
  job_title_id: z.string().uuid().nullable().optional(),
  job_title_name: z.string().trim().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z
    .enum(['active', 'leave', 'suspended', 'resigned', 'transferred', 'terminated'])
    .optional(),
});

const transferSchema = z.object({
  id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  section_id: z.string().uuid().nullable().optional(),
  job_title_id: z.string().uuid().nullable().optional(),
  manager_id: z.string().uuid().nullable().optional(),
  supervisor_id: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3),
});

async function resolveTitle(
  organizationId: string,
  id?: string | null,
  name?: string | null,
) {
  if (id) return id;
  if (!name) return null;

  const result = await pool.query(
    `
      select id
      from public.job_titles
      where organization_id = $1::uuid
        and name = $2
        and active = true
        and deleted_at is null
      limit 1
    `,
    [organizationId, name],
  );

  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

function createEmployeeNumber() {
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `EMP-${Date.now()}-${random}`;
}

async function assertRelatedEmployeeAccess(
  context: Awaited<ReturnType<typeof requireUser>>,
  employeeId?: string | null,
) {
  if (employeeId) await assertEmployeeAccess(context, employeeId);
}

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'employees.view');

    const url = new URL(req.url);
    const result = await visibleEmployees(context, {
      limit: Number(url.searchParams.get('limit') || 100),
      offset: Number(url.searchParams.get('offset') || 0),
      search: url.searchParams.get('search') || '',
    });

    return NextResponse.json({
      ok: true,
      employees: result.rows,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        has_more: result.hasMore,
      },
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'employees.create');

    const payload = createSchema.parse(await req.json());
    const titleId = await resolveTitle(
      context.organizationId,
      payload.job_title_id,
      payload.job_title_name,
    );

    if ((payload.job_title_id || payload.job_title_name) && !titleId) {
      throw new Error('JOB_TITLE_NOT_FOUND');
    }

    await assertRelatedEmployeeAccess(context, payload.manager_id);

    const employeeNumber = createEmployeeNumber();
    const managerId = payload.manager_id ?? context.user.employeeId ?? null;
    let employee: any;

    await withNeonTransaction(async (tx) => {
      const result = await tx.query(
        `
          insert into public.employees(
            organization_id,
            employee_number,
            full_name,
            email,
            phone,
            job_title_id,
            manager_id,
            status,
            created_by
          )
          values(
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6::uuid,
            $7::uuid,
            'active',
            $8::uuid
          )
          returning id, employee_number, full_name, job_title_id, status
        `,
        [
          context.organizationId,
          employeeNumber,
          payload.full_name,
          payload.email || null,
          payload.phone || null,
          titleId,
          managerId,
          context.user.id,
        ],
      );

      employee = result.rows[0];

      await tx.query(
        `
          insert into public.employee_assignments(
            employee_id,
            job_title_id,
            manager_id,
            effective_from,
            reason,
            is_current,
            created_by
          )
          values($1::uuid, $2::uuid, $3::uuid, current_date, $4, true, $5::uuid)
        `,
        [
          employee.id,
          titleId,
          managerId,
          'إضافة موظف من واجهة التقييم',
          context.user.id,
        ],
      );

      await tx.query(
        `
          insert into public.audit_logs(
            organization_id,
            user_id,
            action,
            entity_type,
            entity_id,
            new_values
          )
          values($1::uuid, $2::uuid, 'employee.create', 'employee', $3::uuid, $4::jsonb)
        `,
        [
          context.organizationId,
          context.user.id,
          employee.id,
          JSON.stringify({
            full_name: payload.full_name,
            job_title_id: titleId,
          }),
        ],
      );
    });

    return NextResponse.json({ ok: true, employee });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

async function transferEmployee(
  context: Awaited<ReturnType<typeof requireUser>>,
  body: any,
) {
  const payload = transferSchema.parse(body);

  await assertEmployeeAccess(context, payload.id);
  await assertRelatedEmployeeAccess(context, payload.manager_id);
  await assertRelatedEmployeeAccess(context, payload.supervisor_id);

  let assignmentId = '';
  await withNeonTransaction(async (tx) => {
    const oldEmployee = await tx.query(
      `
        select
          branch_id,
          department_id,
          section_id,
          job_title_id,
          manager_id,
          supervisor_id
        from public.employees
        where id = $1::uuid
          and organization_id = $2::uuid
        for update
      `,
      [payload.id, context.organizationId],
    );

    if (!oldEmployee.rows[0]) {
      throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
    }

    await tx.query(
      `
        update public.employee_assignments
        set is_current = false,
            effective_to = current_date
        where employee_id = $1::uuid
          and is_current = true
      `,
      [payload.id],
    );

    const assignment = await tx.query(
      `
        insert into public.employee_assignments(
          employee_id,
          branch_id,
          department_id,
          section_id,
          job_title_id,
          manager_id,
          supervisor_id,
          effective_from,
          reason,
          is_current,
          created_by
        )
        values(
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::uuid,
          $7::uuid,
          current_date,
          $8,
          true,
          $9::uuid
        )
        returning id
      `,
      [
        payload.id,
        payload.branch_id || null,
        payload.department_id || null,
        payload.section_id || null,
        payload.job_title_id || null,
        payload.manager_id || null,
        payload.supervisor_id || null,
        payload.reason,
        context.user.id,
      ],
    );

    assignmentId = String(assignment.rows[0].id);

    await tx.query(
      `
        update public.employees
        set branch_id = $2::uuid,
            department_id = $3::uuid,
            section_id = $4::uuid,
            job_title_id = $5::uuid,
            manager_id = $6::uuid,
            supervisor_id = $7::uuid,
            updated_at = now()
        where id = $1::uuid
      `,
      [
        payload.id,
        payload.branch_id || null,
        payload.department_id || null,
        payload.section_id || null,
        payload.job_title_id || null,
        payload.manager_id || null,
        payload.supervisor_id || null,
      ],
    );

    await tx.query(
      `
        insert into public.audit_logs(
          organization_id,
          user_id,
          action,
          entity_type,
          entity_id,
          old_values,
          new_values,
          reason
        )
        values(
          $1::uuid,
          $2::uuid,
          'employee.transfer',
          'employee',
          $3::uuid,
          $4::jsonb,
          $5::jsonb,
          $6
        )
      `,
      [
        context.organizationId,
        context.user.id,
        payload.id,
        JSON.stringify(oldEmployee.rows[0]),
        JSON.stringify(payload),
        payload.reason,
      ],
    );
  });

  return assignmentId;
}

async function updateEmployee(
  context: Awaited<ReturnType<typeof requireUser>>,
  body: any,
) {
  const payload = updateSchema.parse(body);
  await assertEmployeeAccess(context, payload.id);

  const titleId = await resolveTitle(
    context.organizationId,
    payload.job_title_id,
    payload.job_title_name,
  );

  if ((payload.job_title_id || payload.job_title_name) && !titleId) {
    throw new Error('JOB_TITLE_NOT_FOUND');
  }

  const titleWasTouched =
    payload.job_title_id !== undefined || payload.job_title_name !== undefined;

  let employee: any;
  await withNeonTransaction(async (tx) => {
    const oldEmployee = await tx.query(
      `
        select *
        from public.employees
        where id = $1::uuid
          and organization_id = $2::uuid
        for update
      `,
      [payload.id, context.organizationId],
    );

    if (!oldEmployee.rows[0]) {
      throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
    }

    const result = await tx.query(
      `
        update public.employees
        set full_name = coalesce($2, full_name),
            email = case when $3::boolean then $4 else email end,
            phone = case when $5::boolean then $6 else phone end,
            status = coalesce($7, status),
            job_title_id = case
              when $8::boolean then $9::uuid
              else job_title_id
            end,
            updated_at = now()
        where id = $1::uuid
        returning id, full_name, job_title_id, status
      `,
      [
        payload.id,
        payload.full_name ?? null,
        payload.email !== undefined,
        payload.email ?? null,
        payload.phone !== undefined,
        payload.phone ?? null,
        payload.status ?? null,
        titleWasTouched,
        titleId,
      ],
    );

    employee = result.rows[0];

    if (titleWasTouched) {
      await tx.query(
        `
          update public.employee_assignments
          set is_current = false,
              effective_to = current_date
          where employee_id = $1::uuid
            and is_current = true
        `,
        [payload.id],
      );

      await tx.query(
        `
          insert into public.employee_assignments(
            employee_id,
            branch_id,
            department_id,
            section_id,
            job_title_id,
            manager_id,
            supervisor_id,
            effective_from,
            reason,
            is_current,
            created_by
          )
          select
            id,
            branch_id,
            department_id,
            section_id,
            job_title_id,
            manager_id,
            supervisor_id,
            current_date,
            $2,
            true,
            $3::uuid
          from public.employees
          where id = $1::uuid
        `,
        [payload.id, 'تعديل المسمى من واجهة التقييم', context.user.id],
      );
    }

    await tx.query(
      `
        insert into public.audit_logs(
          organization_id,
          user_id,
          action,
          entity_type,
          entity_id,
          old_values,
          new_values
        )
        values(
          $1::uuid,
          $2::uuid,
          'employee.update',
          'employee',
          $3::uuid,
          $4::jsonb,
          $5::jsonb
        )
      `,
      [
        context.organizationId,
        context.user.id,
        payload.id,
        JSON.stringify(oldEmployee.rows[0]),
        JSON.stringify(employee),
      ],
    );
  });

  return employee;
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'employees.update');

    const body = await req.json();
    if (body?.action === 'transfer') {
      const assignmentId = await transferEmployee(context, body);
      return NextResponse.json({ ok: true, assignment_id: assignmentId });
    }

    const employee = await updateEmployee(context, body);
    return NextResponse.json({ ok: true, employee });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'employees.delete');

    const id = z.string().uuid().parse(new URL(req.url).searchParams.get('id'));
    await assertEmployeeAccess(context, id);

    await withNeonTransaction(async (tx) => {
      const oldEmployee = await tx.query(
        `
          select id, full_name, status
          from public.employees
          where id = $1::uuid
            and organization_id = $2::uuid
          for update
        `,
        [id, context.organizationId],
      );

      if (!oldEmployee.rows[0]) {
        throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      }

      await tx.query(
        `
          update public.employees
          set status = 'terminated',
              work_end_date = current_date,
              deleted_at = coalesce(deleted_at, now()),
              updated_at = now()
          where id = $1::uuid
        `,
        [id],
      );

      await tx.query(
        `
          update public.employee_assignments
          set is_current = false,
              effective_to = current_date
          where employee_id = $1::uuid
            and is_current = true
        `,
        [id],
      );

      await tx.query(
        `
          insert into public.audit_logs(
            organization_id,
            user_id,
            action,
            entity_type,
            entity_id,
            old_values
          )
          values(
            $1::uuid,
            $2::uuid,
            'employee.soft_delete',
            'employee',
            $3::uuid,
            $4::jsonb
          )
        `,
        [
          context.organizationId,
          context.user.id,
          id,
          JSON.stringify(oldEmployee.rows[0]),
        ],
      );
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
