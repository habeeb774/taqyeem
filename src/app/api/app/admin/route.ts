import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { can, jsonError, must, requireUser } from '@/server/context';

const adminPermissions = [
  'branches.manage',
  'departments.manage',
  'sections.manage',
  'job_titles.manage',
  'roles.manage',
  'settings.manage',
];

const branchSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().default(''),
  city: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});

const departmentSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().default(''),
  branch_id: z.string().uuid().nullable().optional(),
  parent_department_id: z.string().uuid().nullable().optional(),
});

const sectionSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().default(''),
  department_id: z.string().uuid(),
});

const jobTitleSchema = z.object({
  name: z.string().min(2),
  code: z.string().optional().default(''),
  description: z.string().optional(),
});

const settingSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  description: z.string().optional(),
});

const roleSchema = z.object({
  code: z.string().min(2).regex(/^[a-z0-9_]+$/),
  name_ar: z.string().min(2),
  description: z.string().optional(),
});

const rolePermissionSchema = z.object({
  role_id: z.string().uuid(),
  permission_id: z.string().uuid(),
  enabled: z.boolean(),
});

const userPermissionOverrideSchema = z.object({
  user_id: z.string().uuid(),
  permission_id: z.string().uuid(),
  effect: z.enum(['allow', 'deny']).nullable(),
});

function codeOf(payload: { code?: string }) {
  return payload.code?.trim()
    ? payload.code.trim()
    : `AUTO_${Date.now().toString(36).toUpperCase()}`;
}

function assertAdminAccess(context: Awaited<ReturnType<typeof requireUser>>) {
  if (adminPermissions.some((permission) => can(context, permission))) return;

  throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
}

async function createBranch(context: Awaited<ReturnType<typeof requireUser>>, body: any) {
  must(context, 'branches.manage');
  const payload = branchSchema.parse(body);
  const result = await pool.query(
    `
      insert into public.branches(
        organization_id,
        name,
        code,
        city,
        address,
        phone,
        created_by
      )
      values($1::uuid, $2, $3, $4, $5, $6, $7::uuid)
      returning *
    `,
    [
      context.organizationId,
      payload.name,
      codeOf(payload),
      payload.city || null,
      payload.address || null,
      payload.phone || null,
      context.user.id,
    ],
  );

  return result.rows[0];
}

async function createDepartment(
  context: Awaited<ReturnType<typeof requireUser>>,
  body: any,
) {
  must(context, 'departments.manage');
  const payload = departmentSchema.parse(body);
  const result = await pool.query(
    `
      insert into public.departments(
        organization_id,
        name,
        code,
        branch_id,
        parent_department_id,
        created_by
      )
      values($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid)
      returning *
    `,
    [
      context.organizationId,
      payload.name,
      codeOf(payload),
      payload.branch_id || null,
      payload.parent_department_id || null,
      context.user.id,
    ],
  );

  return result.rows[0];
}

async function createSection(context: Awaited<ReturnType<typeof requireUser>>, body: any) {
  must(context, 'sections.manage');
  const payload = sectionSchema.parse(body);
  const result = await pool.query(
    `
      insert into public.sections(
        organization_id,
        name,
        code,
        department_id,
        created_by
      )
      values($1::uuid, $2, $3, $4::uuid, $5::uuid)
      returning *
    `,
    [
      context.organizationId,
      payload.name,
      codeOf(payload),
      payload.department_id,
      context.user.id,
    ],
  );

  return result.rows[0];
}

async function createJobTitle(
  context: Awaited<ReturnType<typeof requireUser>>,
  body: any,
) {
  must(context, 'job_titles.manage');
  const payload = jobTitleSchema.parse(body);
  const result = await pool.query(
    `
      insert into public.job_titles(
        organization_id,
        name,
        code,
        description,
        created_by
      )
      values($1::uuid, $2, $3, $4, $5::uuid)
      returning *
    `,
    [
      context.organizationId,
      payload.name,
      codeOf(payload),
      payload.description || null,
      context.user.id,
    ],
  );

  return result.rows[0];
}

async function saveSetting(context: Awaited<ReturnType<typeof requireUser>>, body: any) {
  must(context, 'settings.manage');
  const payload = settingSchema.parse(body);

  await pool.query(
    `
      insert into public.system_settings(
        organization_id,
        key,
        value,
        description,
        updated_by
      )
      values($1::uuid, $2, $3::jsonb, $4, $5::uuid)
      on conflict(organization_id, key) do update set
        value = excluded.value,
        description = excluded.description,
        updated_by = excluded.updated_by,
        updated_at = now()
    `,
    [
      context.organizationId,
      payload.key,
      JSON.stringify(payload.value),
      payload.description || null,
      context.user.id,
    ],
  );
}

async function createRole(context: Awaited<ReturnType<typeof requireUser>>, body: any) {
  must(context, 'roles.manage');
  const payload = roleSchema.parse(body);
  const result = await pool.query(
    `
      insert into public.roles(
        organization_id,
        code,
        name_ar,
        description,
        is_system,
        active
      )
      values($1::uuid, $2, $3, $4, false, true)
      returning *
    `,
    [
      context.organizationId,
      payload.code,
      payload.name_ar,
      payload.description || null,
    ],
  );

  return result.rows[0];
}

async function setRolePermission(
  context: Awaited<ReturnType<typeof requireUser>>,
  body: any,
) {
  must(context, 'roles.manage');
  const payload = rolePermissionSchema.parse(body);

  const role = await pool.query(
    `
      select 1
      from public.roles
      where id = $1::uuid
        and (organization_id is null or organization_id = $2::uuid)
    `,
    [payload.role_id, context.organizationId],
  );

  if (!role.rows[0]) throw new Error('INVALID_ROLE');

  if (payload.enabled) {
    await pool.query(
      `
        insert into public.role_permissions(role_id, permission_id)
        values($1::uuid, $2::uuid)
        on conflict do nothing
      `,
      [payload.role_id, payload.permission_id],
    );
    return;
  }

  await pool.query(
    `
      delete from public.role_permissions
      where role_id = $1::uuid
        and permission_id = $2::uuid
    `,
    [payload.role_id, payload.permission_id],
  );
}

async function setUserPermissionOverride(
  context: Awaited<ReturnType<typeof requireUser>>,
  body: any,
) {
  must(context, 'roles.manage');
  const payload = userPermissionOverrideSchema.parse(body);

  if (payload.effect) {
    await pool.query(
      `
        insert into public.user_permission_overrides(
          user_id,
          permission_id,
          organization_id,
          effect,
          created_by
        )
        values($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid)
        on conflict(user_id, permission_id, organization_id) do update set
          effect = excluded.effect,
          created_by = excluded.created_by,
          created_at = now()
      `,
      [
        payload.user_id,
        payload.permission_id,
        context.organizationId,
        payload.effect,
        context.user.id,
      ],
    );
    return;
  }

  await pool.query(
    `
      delete from public.user_permission_overrides
      where user_id = $1::uuid
        and permission_id = $2::uuid
        and organization_id = $3::uuid
    `,
    [payload.user_id, payload.permission_id, context.organizationId],
  );
}

export async function GET() {
  try {
    const context = await requireUser();
    assertAdminAccess(context);

    const [
      branches,
      departments,
      sections,
      jobTitles,
      roles,
      permissions,
      rolePermissions,
      settings,
    ] = await Promise.all([
      pool.query(
        `
          select id, name, code, city, address, phone, active, manager_employee_id
          from public.branches
          where organization_id = $1::uuid
            and deleted_at is null
          order by name
        `,
        [context.organizationId],
      ),
      pool.query(
        `
          select
            id,
            name,
            code,
            branch_id,
            parent_department_id,
            manager_employee_id,
            active
          from public.departments
          where organization_id = $1::uuid
            and deleted_at is null
          order by name
        `,
        [context.organizationId],
      ),
      pool.query(
        `
          select id, name, code, department_id, manager_employee_id, active
          from public.sections
          where organization_id = $1::uuid
            and deleted_at is null
          order by name
        `,
        [context.organizationId],
      ),
      pool.query(
        `
          select id, name, code, description, active
          from public.job_titles
          where organization_id = $1::uuid
            and deleted_at is null
          order by name
        `,
        [context.organizationId],
      ),
      pool.query(
        `
          select id, code, name_ar, description, is_system, active
          from public.roles
          where organization_id is null
             or organization_id = $1::uuid
          order by name_ar
        `,
        [context.organizationId],
      ),
      pool.query(
        `
          select id, code, name_ar, description
          from public.permissions
          order by code
        `,
      ),
      pool.query(
        `
          select rp.role_id, rp.permission_id
          from public.role_permissions rp
          join public.roles r on r.id = rp.role_id
          where r.organization_id is null
             or r.organization_id = $1::uuid
        `,
        [context.organizationId],
      ),
      pool.query(
        `
          select id, key, value, description, updated_at
          from public.system_settings
          where organization_id = $1::uuid
          order by key
        `,
        [context.organizationId],
      ),
    ]);

    return NextResponse.json({
      ok: true,
      branches: branches.rows,
      departments: departments.rows,
      sections: sections.rows,
      job_titles: jobTitles.rows,
      roles: roles.rows,
      permissions: permissions.rows,
      role_permissions: rolePermissions.rows,
      settings: settings.rows,
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
    const body = await req.json();
    const action = String(body?.action || '');

    if (action === 'create_branch') {
      return NextResponse.json({
        ok: true,
        item: await createBranch(context, body),
      });
    }

    if (action === 'create_department') {
      return NextResponse.json({
        ok: true,
        item: await createDepartment(context, body),
      });
    }

    if (action === 'create_section') {
      return NextResponse.json({
        ok: true,
        item: await createSection(context, body),
      });
    }

    if (action === 'create_job_title') {
      return NextResponse.json({
        ok: true,
        item: await createJobTitle(context, body),
      });
    }

    if (action === 'save_setting') {
      await saveSetting(context, body);
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_role') {
      return NextResponse.json({
        ok: true,
        item: await createRole(context, body),
      });
    }

    if (action === 'set_role_permission') {
      await setRolePermission(context, body);
      return NextResponse.json({ ok: true });
    }

    if (action === 'set_user_permission_override') {
      await setUserPermissionOverride(context, body);
      return NextResponse.json({ ok: true });
    }

    throw new Error('INVALID_ACTION');
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
