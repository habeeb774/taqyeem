type QueryClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> };

export type ResolvedApprovalStep = {
  stepOrder: number;
  approverUserId: string;
  approverRole: string;
};

/** Resolve template workflow roles to the real users at submission time. */
export async function resolveFormApprovers(
  client: QueryClient,
  organizationId: string,
  templateKey: string,
  employeeId: string | null,
): Promise<ResolvedApprovalStep[]> {
  const configured = await client.query(`
    select s.step_order,s.approver_type,s.approver_role_id,s.approver_user_id,
           r.code role_code
    from public.form_templates t
    join public.form_workflows w on w.id=(
      select w2.id from public.form_workflows w2
      where w2.template_id=t.id and w2.active=true
      order by w2.created_at desc limit 1
    )
    join public.form_approval_steps s on s.workflow_id=w.id
    left join public.roles r on r.id=s.approver_role_id
    where t.organization_id=$1::uuid and t.template_key=$2 and t.active=true
    order by s.step_order`, [organizationId, templateKey]);

  const rows = configured.rows;
  if (!rows.length && employeeId) {
    const fallback = await client.query(`
      select u.id
      from public.employees e
      join public.employees m on m.id=e.manager_id
      join public.users u on u.employee_id=m.id and u.active=true
      where e.id=$1::uuid and e.organization_id=$2::uuid limit 1`, [employeeId, organizationId]);
    return fallback.rows[0] ? [{ stepOrder: 1, approverUserId: String(fallback.rows[0].id), approverRole: 'direct_manager' }] : [];
  }

  const employee = employeeId ? (await client.query(`
    select eu.id employee_user_id,e.manager_id,e.department_id,e.branch_id,
           mu.id manager_user_id,du.id department_manager_user_id,bu.id branch_manager_user_id
    from public.employees e
    left join public.users eu on eu.employee_id=e.id and eu.active=true
    left join public.users mu on mu.employee_id=e.manager_id and mu.active=true
    left join public.departments d on d.id=e.department_id
    left join public.users du on du.employee_id=d.manager_employee_id and du.active=true
    left join public.branches b on b.id=e.branch_id
    left join public.users bu on bu.employee_id=b.manager_employee_id and bu.active=true
    where e.id=$1::uuid and e.organization_id=$2::uuid limit 1`, [employeeId, organizationId])).rows[0] : null;

  const resolved: ResolvedApprovalStep[] = [];
  for (const step of rows) {
    let userId: string | null = null;
    if (step.approver_type === 'user') userId = step.approver_user_id;
    else if (step.approver_type === 'employee') userId = employee?.employee_user_id;
    else if (step.approver_type === 'direct_manager') userId = employee?.manager_user_id;
    else if (step.approver_type === 'department_manager') userId = employee?.department_manager_user_id;
    else if (step.approver_type === 'branch_manager') userId = employee?.branch_manager_user_id;
    else if (step.approver_type === 'role') {
      const roleUser = await client.query(`
        select u.id from public.user_roles ur join public.users u on u.id=ur.user_id and u.active=true
        where ur.organization_id=$1::uuid and ur.role_id=$2::uuid order by ur.created_at limit 1`,
        [organizationId, step.approver_role_id]);
      userId = roleUser.rows[0]?.id || null;
    }
    if (userId) resolved.push({ stepOrder: Number(step.step_order), approverUserId: String(userId), approverRole: String(step.role_code || step.approver_type) });
  }
  return resolved;
}
