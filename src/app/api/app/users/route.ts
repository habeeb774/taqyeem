import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { withNeonTransaction } from '@/lib/neon/admin';
import { jsonError, must, requireUser } from '@/server/context';

const scopeTypes = ['organization', 'branch', 'department', 'assigned_employees'] as const;

const createSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  password: z.string().min(8),
  employee_id: z.string().uuid().nullable().optional(),
  role_id: z.string().uuid(),
  scope_type: z.enum(scopeTypes),
  scope_id: z.string().uuid().nullable().optional(),
}).superRefine((value, context) => {
  if (['branch', 'department'].includes(value.scope_type) && !value.scope_id) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scope_id'],
      message: 'SCOPE_REQUIRED',
    });
  }
});

const updateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
});

function nullableScopeId(scopeType: string, scopeId?: string | null) {
  return ['organization', 'assigned_employees'].includes(scopeType) ? null : scopeId || null;
}

function errorResponse(error: unknown) {
  const result = jsonError(error);
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: result.status },
  );
}

type UserRow = {
  id: string;
  employee_id: string | null;
  full_name: string | null;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
};

type RoleRow = {
  id: string;
  code: string;
  name_ar: string;
  description: string | null;
  is_system: boolean;
  active: boolean;
};

type UserRoleRow = {
  id: string;
  user_id: string;
  role_id: string;
  role_scopes: unknown;
};

type PermissionOverrideRow = {
  user_id: string;
  permission_id: string;
  effect: string;
};

type UserScopeRow = {
  id: string;
  user_id: string;
  scope_type: string;
  scope_id: string | null;
};

type EmployeeIdentityRow = {
  id: string;
  full_name: string;
  email: string | null;
};

type IdRow = { id: string };
type ExistsRow = { exists_flag: number };

export async function GET() {
  try {
    const context = await requireUser();
    must(context, 'users.view');

    const [users, roles, userRoles, overrides, userScopes] = await Promise.all([
      pool.query<UserRow>(
        `select id,employee_id,name full_name,email,active is_active,last_login_at
         from public.users
         where organization_id=$1::uuid
         order by name nulls last,email`,
        [context.organizationId],
      ),
      pool.query<RoleRow>(
        `select id,code,name_ar,description,is_system,active
         from public.roles
         where (organization_id is null or organization_id=$1::uuid) and active=true
         order by name_ar`,
        [context.organizationId],
      ),
      pool.query<UserRoleRow>(
        `select ur.id,ur.user_id,ur.role_id,
                coalesce(json_agg(json_build_object('scope_type',rs.scope_type,'scope_id',rs.scope_id))
                  filter(where rs.id is not null),'[]') role_scopes
         from public.user_roles ur
         left join public.role_scopes rs on rs.user_role_id=ur.id
         where ur.organization_id=$1::uuid
         group by ur.id`,
        [context.organizationId],
      ),
      pool.query<PermissionOverrideRow>(
        `select user_id,permission_id,effect
         from public.user_permission_overrides
         where organization_id=$1::uuid or organization_id is null`,
        [context.organizationId],
      ),
      pool.query<UserScopeRow>(
        `select id,user_id,scope_type,scope_id
         from public.user_scopes
         where organization_id=$1::uuid
         order by created_at`,
        [context.organizationId],
      ),
    ]);

    return NextResponse.json({
      ok: true,
      users: users.rows.map((user) => ({
        ...user,
        roles: userRoles.rows.filter((role) => String(role.user_id) === String(user.id)),
        scopes: userScopes.rows.filter((scope) => String(scope.user_id) === String(user.id)),
      })),
      roles: roles.rows,
      permission_overrides: overrides.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'users.create');
    must(context, 'roles.manage');

    const value = createSchema.parse(await request.json());
    const role = await pool.query<IdRow>(
      `select id
       from public.roles
       where id=$1::uuid and active=true and (organization_id is null or organization_id=$2::uuid)`,
      [value.role_id, context.organizationId],
    );
    if (!role.rows[0]) throw new Error('INVALID_ROLE');

    let employeeName = value.full_name;
    let employeeEmail = value.email;

    if (value.employee_id) {
      const employee = await pool.query<EmployeeIdentityRow>(
        `select id,full_name,email
         from public.employees
         where id=$1::uuid and organization_id=$2::uuid and deleted_at is null`,
        [value.employee_id, context.organizationId],
      );
      if (!employee.rows[0]) throw new Error('INVALID_EMPLOYEE');

      const existingUser = await pool.query<ExistsRow>(
        `select 1 as exists_flag
         from public.users
         where employee_id=$1::uuid and organization_id=$2::uuid
         limit 1`,
        [value.employee_id, context.organizationId],
      );
      if (existingUser.rows[0]) throw new Error('EMPLOYEE_ALREADY_HAS_USER');

      employeeName = employee.rows[0].full_name || employeeName;
      employeeEmail = employee.rows[0].email || employeeEmail;
    }

    const userId = randomUUID();
    const email = employeeEmail.toLowerCase();
    const passwordHash = await hash(value.password, 12);
    const scopeId = nullableScopeId(value.scope_type, value.scope_id);

    await withNeonTransaction(async (transaction) => {
      await transaction.query(
        `insert into public.users(id,name,email,password_hash,organization_id,employee_id,active)
         values($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,true)`,
        [userId, employeeName, email, passwordHash, context.organizationId, value.employee_id || null],
      );

      await transaction.query(
        `insert into public.profiles(id,organization_id,employee_id,full_name,email,is_active)
         values($1::uuid,$2::uuid,$3::uuid,$4,$5,true)
         on conflict(id) do update set
           organization_id=excluded.organization_id,
           employee_id=excluded.employee_id,
           full_name=excluded.full_name,
           email=excluded.email,
           is_active=true,
           updated_at=now()`,
        [userId, context.organizationId, value.employee_id || null, employeeName, email],
      );

      const userRole = await transaction.query<IdRow>(
        `insert into public.user_roles(user_id,role_id,organization_id,created_by)
         values($1::uuid,$2::uuid,$3::uuid,$4::uuid)
         returning id`,
        [userId, value.role_id, context.organizationId, context.user.id],
      );

      await transaction.query(
        `insert into public.role_scopes(user_role_id,scope_type,scope_id)
         values($1::uuid,$2,$3::uuid)`,
        [userRole.rows[0].id, value.scope_type, scopeId],
      );

      await transaction.query(
        `insert into public.user_scopes(user_id,organization_id,scope_type,scope_id,created_by)
         values($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid)
         on conflict do nothing`,
        [userId, context.organizationId, value.scope_type, scopeId, context.user.id],
      );

      await transaction.query(
        `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
         values($1::uuid,$2::uuid,'user.create','user',$3::uuid,$4::jsonb)`,
        [
          context.organizationId,
          context.user.id,
          userId,
          JSON.stringify({
            email,
            role_id: value.role_id,
            scope_type: value.scope_type,
            scope_id: value.scope_id || null,
          }),
        ],
      );
    });

    return NextResponse.json({ ok: true, id: userId });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'users.update');

    const value = updateSchema.parse(await request.json());
    if (value.id === context.user.id && !value.is_active) throw new Error('CANNOT_DISABLE_SELF');

    await pool.query(
      `update public.users
       set active=$2,updated_at=now()
       where id=$1::uuid and organization_id=$3::uuid`,
      [value.id, value.is_active, context.organizationId],
    );
    await pool.query(
      `update public.profiles
       set is_active=$2,updated_at=now()
       where id=$1::uuid and organization_id=$3::uuid`,
      [value.id, value.is_active, context.organizationId],
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
