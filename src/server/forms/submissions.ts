import { pool } from '@/db';
import { can, type SecurityContext } from '@/db/queries/security';
import { syncFormDomainRecords } from './domain-records';

export type SaveFormDocumentInput = {
  formType: string;
  documentNumber: string;
  employeeId?: string | null;
  candidateId?: string | null;
  employeeSnapshot: Record<string, unknown>;
  status: 'draft' | 'issued';
  payload: Record<string, unknown>;
};

/** Saves the compatibility document and normalized submission as one unit. */
export async function saveFormDocument(context: SecurityContext, input: SaveFormDocumentInput) {
  const templateKey = input.formType === '__draft__' && typeof input.payload.formId === 'string'
    ? input.payload.formId
    : input.formType;
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (input.candidateId) {
      const candidate = await client.query(
        `select id from public.candidates where id=$1::uuid and organization_id=$2::uuid`,
        [input.candidateId, context.organizationId],
      );
      if (!candidate.rows[0]) throw Object.assign(new Error('CANDIDATE_NOT_FOUND'), { status: 404 });
    }
    const existing = await client.query(
      `select id,status,created_by from public.form_documents
       where organization_id=$1::uuid and document_no=$2
       for update`,
      [context.organizationId, input.documentNumber],
    );
    const old = existing.rows[0];
    if (old) {
      const ownsDocument = String(old.created_by) === String(context.user.id);
      if (!ownsDocument && !can(context, 'forms.view_all')) {
        throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      }
      if (!['draft', 'returned_for_edit', 'issued'].includes(String(old.status))) {
        throw Object.assign(new Error('DOCUMENT_NOT_EDITABLE'), { status: 409 });
      }
    }

    const document = await client.query(
      `insert into public.form_documents(
         organization_id,form_type,document_no,employee_id,candidate_id,employee_snapshot,status,payload,
         submitted_at,created_by,updated_by
       ) values($1::uuid,$2,$3,$4::uuid,$5::uuid,$6::jsonb,$7,$8::jsonb,
         case when $7='issued' then now() else null end,$9::uuid,$9::uuid)
       on conflict(organization_id,document_no) do update set
         status=excluded.status,payload=excluded.payload,
         employee_id=coalesce(excluded.employee_id,form_documents.employee_id),
         candidate_id=coalesce(excluded.candidate_id,form_documents.candidate_id),
         employee_snapshot=case when excluded.employee_snapshot <> '{}'::jsonb
           then excluded.employee_snapshot else form_documents.employee_snapshot end,
         submitted_at=coalesce(excluded.submitted_at,form_documents.submitted_at),
         updated_by=excluded.updated_by,updated_at=now(),deleted_at=null
       returning *`,
      [
        context.organizationId, input.formType, input.documentNumber, input.employeeId || null,
        input.candidateId || null, JSON.stringify(input.employeeSnapshot), input.status,
        JSON.stringify(input.payload), context.user.id,
      ],
    );

    const submission = await client.query(
      `insert into public.form_submissions(
         organization_id,document_number,form_template_id,employee_id,candidate_id,branch_id,department_id,
         employee_snapshot,status,created_by,updated_at
       )
       select $1::uuid,$2,t.id,$3::uuid,$4::uuid,e.branch_id,e.department_id,$5::jsonb,$6,$7::uuid,now()
       from public.form_templates t
       left join public.employees e on e.id=$3::uuid
       where t.organization_id=$1::uuid and t.template_key=$8
       on conflict(organization_id,document_number) do update set
         employee_id=coalesce(excluded.employee_id,form_submissions.employee_id),
         candidate_id=coalesce(excluded.candidate_id,form_submissions.candidate_id),
         branch_id=coalesce(excluded.branch_id,form_submissions.branch_id),
         department_id=coalesce(excluded.department_id,form_submissions.department_id),
         employee_snapshot=case when excluded.employee_snapshot <> '{}'::jsonb
           then excluded.employee_snapshot else form_submissions.employee_snapshot end,
         status=excluded.status,updated_at=now(),deleted_at=null
       returning id`,
      [
        context.organizationId, input.documentNumber, input.employeeId || null, input.candidateId || null,
        JSON.stringify(input.employeeSnapshot), input.status, context.user.id, templateKey,
      ],
    );

    if (submission.rows[0]) {
      await client.query('delete from public.form_submission_values where submission_id=$1::uuid', [submission.rows[0].id]);
      await client.query(
        `insert into public.form_submission_values(submission_id,field_key,value)
         select $1::uuid,x.key,x.value from jsonb_each($2::jsonb) x`,
        [submission.rows[0].id, JSON.stringify(input.payload)],
      );
      if (input.status === 'issued') {
        await syncFormDomainRecords(client, {
          organizationId: context.organizationId,
          submissionId: String(submission.rows[0].id),
          formType: templateKey,
          employeeId: input.employeeId || null,
          createdBy: context.user.id,
          payload: input.payload,
        });
      }
    }

    await client.query(
      `insert into public.audit_logs(
         organization_id,user_id,action,entity_type,entity_id,old_values,new_values
       ) values($1::uuid,$2::uuid,$3,'form_document',$4::uuid,$5::jsonb,$6::jsonb)`,
      [
        context.organizationId, context.user.id, old ? 'form.update' : 'form.create', document.rows[0].id,
        JSON.stringify(old ? { status: old.status } : null),
        JSON.stringify({
          document_no: input.documentNumber,
          status: input.status,
          employee_id: input.employeeId || null,
          candidate_id: input.candidateId || null,
        }),
      ],
    );
    await client.query('commit');
    return document.rows[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
