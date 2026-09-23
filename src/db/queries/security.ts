import { pool } from '@/db';

export type Scope = {
  type: 'organization' | 'branch' | 'department' | 'assigned_employees';
  id: string | null;
};

export type SecurityContext = {
  user: {
    id: string;
    email: string;
    name: string | null;
    employeeId: string | null;
  };
  organizationId: string;
  roles: {
    user_role_id: string;
    role_id: string;
    code: string;
    name: string;
    scopes: Scope[];
  }[];
  permissions: string[];
  scopes: Scope[];
};

export async function loadSecurityContext(userId: string): Promise<SecurityContext> {
  const userResult = await pool.query(
    `select
       u.id,
       u.email,
       u.name,
       u.employee_id,
       u.organization_id,
       u.active,
       p.full_name,
       p.is_active
     from public.users u
     left join public.profiles p on p.id = u.id
     where u.id = $1::uuid
     limit 1`,
    [userId],
  );

  const user = userResult.rows[0] as any;
  if (!user?.active || user?.is_active === false || !user.organization_id) {
    throw Object.assign(new Error('PROFILE_NOT_READY'), { status: 403 });
  }

  const roleResult = await pool.query(
    `select
       ur.id user_role_id,
       r.id role_id,
       r.code,
       r.name_ar,
       coalesce(
         json_agg(json_build_object('type', rs.scope_type, 'id', rs.scope_id))
           filter(where rs.id is not null),
         '[]'
       ) scopes
     from public.user_roles ur
     join public.roles r on r.id = ur.role_id and r.active = true
     left join public.role_scopes rs on rs.user_role_id = ur.id
     where ur.user_id = $1::uuid
       and ur.organization_id = $2::uuid
     group by ur.id, r.id, r.code, r.name_ar`,
    [userId, user.organization_id],
  );

  const roles = roleResult.rows.map((role: any) => ({
    user_role_id: String(role.user_role_id),
    role_id: String(role.role_id),
    code: String(role.code),
    name: String(role.name_ar),
    scopes: (role.scopes || []).map((scope: any) => ({
      type: scope.type,
      id: scope.id ? String(scope.id) : null,
    })),
  }));

  const roleIds = roles.map((role) => role.role_id);
  const basePermissions = roleIds.length
    ? await pool.query(
        `select distinct p.code
         from public.role_permissions rp
         join public.permissions p on p.id = rp.permission_id
         where rp.role_id = any($1::uuid[])`,
        [roleIds],
      )
    : ({ rows: [] } as any);

  const overrides = await pool.query(
    `select p.code, o.effect
     from public.user_permission_overrides o
     join public.permissions p on p.id = o.permission_id
     where o.user_id = $1::uuid
       and (o.organization_id = $2::uuid or o.organization_id is null)`,
    [userId, user.organization_id],
  );

  const permissions = new Set<string>(basePermissions.rows.map((permission: any) => String(permission.code)));
  for (const override of overrides.rows as any[]) {
    if (override.effect === 'allow') permissions.add(String(override.code));
    else permissions.delete(String(override.code));
  }

  const directScopes = await pool.query(
    `select scope_type, scope_id
     from public.user_scopes
     where user_id = $1::uuid
       and organization_id = $2::uuid`,
    [userId, user.organization_id],
  );

  const rawScopes = [
    ...roles.flatMap((role) => role.scopes),
    ...directScopes.rows.map((scope: any) => ({
      type: String(scope.scope_type),
      id: scope.scope_id ? String(scope.scope_id) : null,
    })),
  ] as Scope[];

  const scopes = dedupeScopes(rawScopes);

  return {
    user: {
      id: String(user.id),
      email: String(user.email),
      name: user.full_name || user.name || null,
      employeeId: user.employee_id ? String(user.employee_id) : null,
    },
    organizationId: String(user.organization_id),
    roles,
    permissions: [...permissions],
    scopes,
  };
}

function dedupeScopes(rawScopes: Scope[]) {
  const seen = new Set<string>();

  return rawScopes.filter((scope) => {
    const key = `${scope.type}:${scope.id || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function can(context: SecurityContext, code: string) {
  return context.permissions.includes(code);
}

export function must(context: SecurityContext, code: string) {
  if (!can(context, code)) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
}

function isElevatedOrganizationRole(context: SecurityContext) {
  return context.roles.some((role) => ['super_admin', 'hr_admin', 'auditor'].includes(role.code));
}

function isManagementRole(context: SecurityContext) {
  return context.roles.some((role) =>
    ['branch_manager', 'department_manager', 'supervisor', 'evaluator'].includes(role.code),
  );
}

function hasDirectoryAuthority(context: SecurityContext) {
  if (isElevatedOrganizationRole(context) || isManagementRole(context)) return true;

  return context.permissions.some((code) =>
    [
      'employees.view',
      'employees.create',
      'employees.update',
      'evaluations.view',
      'evaluations.create',
      'evaluations.edit',
      'evaluations.submit',
      'attendance.view',
      'attendance.manage',
      'targets.manage',
      'forms.manage',
    ].includes(code),
  );
}

function scopeParts(context: SecurityContext) {
  const elevated = isElevatedOrganizationRole(context);
  const managerMustStayScoped = isManagementRole(context) && !elevated;
  const scopeAllowed = hasDirectoryAuthority(context);

  return {
    org: scopeAllowed && !managerMustStayScoped && context.scopes.some((scope) => scope.type === 'organization'),
    branches: scopeAllowed
      ? context.scopes.filter((scope) => scope.type === 'branch' && scope.id).map((scope) => scope.id!)
      : [],
    departments: scopeAllowed
      ? context.scopes.filter((scope) => scope.type === 'department' && scope.id).map((scope) => scope.id!)
      : [],
    assigned: scopeAllowed && context.scopes.some((scope) => scope.type === 'assigned_employees'),
    excludeSelfFromDirectory: managerMustStayScoped,
  };
}

const employeeScopeCte = `
  with recursive scoped_departments(id) as (
    select unnest($4::uuid[])
    union
    select d.id
    from public.departments d
    join scoped_departments sd on d.parent_department_id = sd.id
    where d.organization_id = $2::uuid
      and d.deleted_at is null
      and d.active = true
  ), subordinate_employees(id) as (
    select e.id
    from public.employees e
    where e.organization_id = $2::uuid
      and e.deleted_at is null
      and $7::uuid is not null
      and (e.id = $7::uuid or e.manager_id = $7::uuid or e.supervisor_id = $7::uuid)
    union
    select child.id
    from public.employees child
    join subordinate_employees parent on child.manager_id = parent.id or child.supervisor_id = parent.id
    where child.organization_id = $2::uuid
      and child.deleted_at is null
  )`;

const employeeScopeWhere = `
  ($3::boolean
    or (cardinality($5::uuid[]) > 0 and e.branch_id = any($5::uuid[]))
    or exists(select 1 from scoped_departments sd where sd.id = e.department_id)
    or (
      $6::boolean
      and exists(
        select 1
        from public.evaluation_assignments a
        where a.employee_id = e.id
          and a.evaluator_user_id = $8::uuid
      )
    )
    or exists(select 1 from subordinate_employees se where se.id = e.id))`;

export async function canAccessEmployee(context: SecurityContext, employeeId: string) {
  const scope = scopeParts(context);
  const result = await pool.query(
    `${employeeScopeCte}
     select exists(
       select 1
       from public.employees e
       where e.id = $1::uuid
         and e.organization_id = $2::uuid
         and e.deleted_at is null
         and ${employeeScopeWhere}
     ) ok`,
    [
      employeeId,
      context.organizationId,
      scope.org,
      scope.departments,
      scope.branches,
      scope.assigned,
      context.user.employeeId,
      context.user.id,
    ],
  );

  return Boolean(result.rows[0]?.ok);
}

export async function assertEmployeeAccess(context: SecurityContext, employeeId: string) {
  if (!(await canAccessEmployee(context, employeeId))) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
}

export async function visibleEmployees(
  context: SecurityContext,
  {
    limit = 100,
    offset = 0,
    search = '',
  }: { limit?: number; offset?: number; search?: string } = {},
) {
  const scope = scopeParts(context);
  const normalizedLimit = Math.max(1, Math.min(200, limit));
  const normalizedOffset = Math.max(0, offset);
  const term = search.trim();

  const result = await pool.query(
    `${employeeScopeCte}
     select
       e.id,
       e.employee_number,
       e.full_name,
       e.email,
       e.phone,
       e.status,
       e.job_title_id,
       e.manager_id,
       e.supervisor_id,
       e.branch_id,
       e.department_id,
       e.section_id,
       j.name job_title_name,
       b.name branch_name,
       d.name department_name,
       m.full_name manager_name,
       count(*) over()::int total_count
     from public.employees e
     left join public.job_titles j on j.id = e.job_title_id
     left join public.branches b on b.id = e.branch_id
     left join public.departments d on d.id = e.department_id
     left join public.employees m on m.id = e.manager_id
     where e.organization_id = $2::uuid
       and e.deleted_at is null
       and ($1::uuid is null or e.id is not null)
       and ${employeeScopeWhere}
       and ($9::boolean = false or $7::uuid is null or e.id <> $7::uuid)
       and (
         $10 = ''
         or e.full_name ilike '%' || $10 || '%'
         or coalesce(e.employee_number, '') ilike '%' || $10 || '%'
         or coalesce(j.name, '') ilike '%' || $10 || '%'
       )
     order by e.full_name
     limit $11 offset $12`,
    [
      null,
      context.organizationId,
      scope.org,
      scope.departments,
      scope.branches,
      scope.assigned,
      context.user.employeeId,
      context.user.id,
      scope.excludeSelfFromDirectory,
      term,
      normalizedLimit,
      normalizedOffset,
    ],
  );

  const total = Number(result.rows[0]?.total_count || 0);

  return {
    rows: result.rows.map((row: any) => ({
      ...row,
      job_titles: row.job_title_name ? { name: row.job_title_name } : null,
      total_count: undefined,
    })),
    total,
    limit: normalizedLimit,
    offset: normalizedOffset,
    hasMore: normalizedOffset + result.rows.length < total,
  };
}

/**
 * Resolve every employee visible to the current server-side security context.
 * Pagination happens inside the server so reports and batch operations never
 * depend on the browser having loaded the full employee directory.
 */
export async function allVisibleEmployees(context: SecurityContext, search = '') {
  const rows: any[] = [];
  let offset = 0;

  for (;;) {
    const page = await visibleEmployees(context, { limit: 200, offset, search });
    rows.push(...page.rows);

    if (!page.hasMore) return rows;
    offset += page.rows.length;
    if (!page.rows.length) return rows;
  }
}

export async function allVisibleEmployeeIds(context: SecurityContext) {
  return (await allVisibleEmployees(context)).map((row: any) => String(row.id));
}
