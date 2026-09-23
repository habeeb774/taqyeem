import { pool } from '@/db';
import type { SecurityContext } from '@/db/queries/security';
import { assertEmployeeAccess } from '@/db/queries/security';

/** The forms module consumes the evaluation system's employee master data. */
export async function getEmployeeFormProfile(c: SecurityContext, employeeId: string) {
  await assertEmployeeAccess(c, employeeId);
  const result = await pool.query(`
    select e.id, e.employee_number, e.full_name, e.email, e.phone, e.status,
           e.branch_id, b.name branch_name, e.department_id, d.name department_name,
           e.job_title_id, jt.name job_title_name, e.manager_id, m.full_name manager_name,
           e.supervisor_id, s.full_name supervisor_name, e.hire_date
    from public.employees e
    left join public.branches b on b.id=e.branch_id
    left join public.departments d on d.id=e.department_id
    left join public.job_titles jt on jt.id=e.job_title_id
    left join public.employees m on m.id=e.manager_id
    left join public.employees s on s.id=e.supervisor_id
    where e.id=$1::uuid and e.organization_id=$2::uuid and e.deleted_at is null
    limit 1`, [employeeId, c.organizationId]);
  const row = result.rows[0];
  if (!row) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return {
    employee_id: String(row.id), employee_number: row.employee_number,
    full_name: row.full_name, email: row.email, phone: row.phone, status: row.status,
    branch_id: row.branch_id, branch_name: row.branch_name || '',
    department_id: row.department_id, department_name: row.department_name || '',
    job_title_id: row.job_title_id, job_title_name: row.job_title_name || '',
    manager_id: row.manager_id, manager_name: row.manager_name || '',
    supervisor_id: row.supervisor_id, supervisor_name: row.supervisor_name || '',
    hire_date: row.hire_date,
  };
}
