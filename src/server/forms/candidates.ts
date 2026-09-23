import { pool } from '@/db';
import { assertEmployeeAccess, must, type SecurityContext } from '@/db/queries/security';
import { withNeonTransaction } from '@/lib/neon/admin';

export type CandidateInput = {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  status?: 'active' | 'hired' | 'rejected' | 'archived';
  employeeId?: string | null;
};

export type CandidateConversionInput = {
  candidateId: string;
  jobTitleId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  managerId?: string | null;
  supervisorId?: string | null;
  hireDate?: string | null;
};

export async function listCandidates(
  context: SecurityContext,
  options: { search?: string; limit?: number; offset?: number } = {},
) {
  must(context, 'forms.view');
  const search = options.search?.trim() || '';
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const offset = Math.max(0, options.offset || 0);
  const result = await pool.query(`
    select id,full_name,email,phone,status,employee_id,created_at,updated_at,
           count(*) over()::int total_count
    from public.candidates
    where organization_id=$1::uuid
      and ($2='' or full_name ilike '%'||$2||'%'
        or coalesce(email,'') ilike '%'||$2||'%'
        or coalesce(phone,'') ilike '%'||$2||'%')
    order by updated_at desc limit $3 offset $4`,
  [context.organizationId, search, limit, offset]);
  const total = Number(result.rows[0]?.total_count || 0);
  return {
    candidates: result.rows.map(({ total_count: _totalCount, ...row }) => row),
    pagination: { total, limit, offset, hasMore: offset + result.rows.length < total },
  };
}

export async function createCandidate(context: SecurityContext, input: CandidateInput) {
  must(context, 'forms.create');
  if (input.employeeId) await assertEmployeeAccess(context, input.employeeId);
  return withNeonTransaction(async (client) => {
    const result = await client.query(`
      insert into public.candidates(
        organization_id,full_name,email,phone,status,employee_id,created_by
      ) values($1::uuid,$2,$3,$4,$5,$6::uuid,$7::uuid)
      returning *`, [
      context.organizationId, input.fullName, input.email || null, input.phone || null,
      input.status || 'active', input.employeeId || null, context.user.id,
    ]);
    await client.query(`
      insert into public.audit_logs(
        organization_id,user_id,action,entity_type,entity_id,new_values
      ) values($1::uuid,$2::uuid,'candidate.create','candidate',$3::uuid,$4::jsonb)`, [
      context.organizationId, context.user.id, result.rows[0].id,
      JSON.stringify({ full_name: input.fullName, status: input.status || 'active' }),
    ]);
    return result.rows[0];
  });
}

export async function convertCandidateToEmployee(
  context: SecurityContext,
  input: CandidateConversionInput,
) {
  must(context, 'forms.create');
  must(context, 'employees.create');
  if (input.managerId) await assertEmployeeAccess(context, input.managerId);
  if (input.supervisorId) await assertEmployeeAccess(context, input.supervisorId);

  return withNeonTransaction(async (client) => {
    const candidateResult = await client.query(`
      select * from public.candidates
      where id=$1::uuid and organization_id=$2::uuid
      for update`, [input.candidateId, context.organizationId]);
    const candidate = candidateResult.rows[0];
    if (!candidate) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    if (candidate.employee_id || candidate.status === 'hired') {
      throw Object.assign(new Error('CANDIDATE_ALREADY_HIRED'), { status: 409 });
    }

    const references = await client.query(`
      select
        ($2::uuid is null or exists(select 1 from public.job_titles where id=$2::uuid and organization_id=$1::uuid and active=true)) title_ok,
        ($3::uuid is null or exists(select 1 from public.branches where id=$3::uuid and organization_id=$1::uuid and active=true)) branch_ok,
        ($4::uuid is null or exists(select 1 from public.departments where id=$4::uuid and organization_id=$1::uuid and active=true)) department_ok`,
    [context.organizationId, input.jobTitleId || null, input.branchId || null, input.departmentId || null]);
    if (!references.rows[0]?.title_ok) throw Object.assign(new Error('JOB_TITLE_NOT_FOUND'), { status: 404 });
    if (!references.rows[0]?.branch_ok) throw Object.assign(new Error('BRANCH_NOT_FOUND'), { status: 404 });
    if (!references.rows[0]?.department_ok) throw Object.assign(new Error('DEPARTMENT_NOT_FOUND'), { status: 404 });

    const employeeNumber = `EMP-${new Date().getUTCFullYear()}-${String(candidate.id).slice(0, 8).toUpperCase()}`;
    const employeeResult = await client.query(`
      insert into public.employees(
        organization_id,employee_number,full_name,email,phone,branch_id,department_id,
        job_title_id,manager_id,supervisor_id,hire_date,status,created_by
      ) values($1::uuid,$2,$3,$4,$5,$6::uuid,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::date,'active',$12::uuid)
      returning *`, [
      context.organizationId, employeeNumber, candidate.full_name, candidate.email, candidate.phone,
      input.branchId || null, input.departmentId || null, input.jobTitleId || null,
      input.managerId || null, input.supervisorId || null, input.hireDate || null, context.user.id,
    ]);
    const employee = employeeResult.rows[0];
    await client.query(`
      insert into public.employee_assignments(
        employee_id,branch_id,department_id,job_title_id,manager_id,supervisor_id,
        effective_from,reason,is_current,created_by
      ) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,coalesce($7::date,current_date),$8,true,$9::uuid)`, [
      employee.id, input.branchId || null, input.departmentId || null, input.jobTitleId || null,
      input.managerId || null, input.supervisorId || null, input.hireDate || null,
      'تحويل مرشح إلى موظف', context.user.id,
    ]);
    await client.query(`
      update public.candidates set status='hired',employee_id=$1::uuid,updated_at=now()
      where id=$2::uuid`, [employee.id, candidate.id]);
    await client.query(`
      insert into public.audit_logs(
        organization_id,user_id,action,entity_type,entity_id,old_values,new_values
      ) values($1::uuid,$2::uuid,'candidate.convert_to_employee','candidate',$3::uuid,$4::jsonb,$5::jsonb)`, [
      context.organizationId, context.user.id, candidate.id,
      JSON.stringify({ status: candidate.status, employee_id: candidate.employee_id }),
      JSON.stringify({ status: 'hired', employee_id: employee.id }),
    ]);
    return { candidateId: String(candidate.id), employee };
  });
}
