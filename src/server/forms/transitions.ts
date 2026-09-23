import { pool } from '@/db';
import { assertEmployeeAccess, can, must, type SecurityContext } from '@/db/queries/security';
import { resolveFormApprovers } from './workflow';
import { syncFormDomainRecords } from './domain-records';

export type FormTransitionAction = 'submit' | 'approve' | 'reject' | 'return' | 'cancel' | 'archive';

const elevatedRoleCodes = new Set(['super_admin', 'hr_admin']);

function isElevated(context: SecurityContext) {
  return context.roles.some((role) => elevatedRoleCodes.has(role.code));
}

function requireTransitionPermission(context: SecurityContext, action: FormTransitionAction) {
  const permission: Record<FormTransitionAction, string> = {
    submit: 'forms.submit',
    approve: 'forms.approve',
    reject: 'forms.reject',
    return: 'forms.approve',
    cancel: 'forms.cancel',
    archive: 'forms.archive',
  };
  must(context, permission[action]);
}

/**
 * Move a form document and its normalized submission through the same lifecycle.
 * The row lock, approvals, timestamps, signatures, history, and audit entry commit together.
 */
export async function transitionFormDocument(
  context: SecurityContext,
  input: { documentId: string; action: FormTransitionAction; comment?: string | null },
) {
  requireTransitionPermission(context, input.action);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query(
      `select id,status,employee_id,form_type,created_by,document_no
       from public.form_documents
       where id=$1::uuid and organization_id=$2::uuid and deleted_at is null
       for update`,
      [input.documentId, context.organizationId],
    );
    const document = result.rows[0];
    if (!document) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    if (document.employee_id) await assertEmployeeAccess(context, String(document.employee_id));

    const currentStatus = String(document.status);
    const ownDocument = String(document.created_by) === String(context.user.id);
    const elevated = isElevated(context);
    let nextStatus = currentStatus;
    let currentApprovalStep = 0;

    if (input.action === 'submit') {
      if (!['draft', 'returned_for_edit'].includes(currentStatus)) {
        throw Object.assign(new Error('INVALID_TRANSITION'), { status: 409 });
      }
      if (!ownDocument && !elevated && !can(context, 'forms.view_all')) {
        throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      }
      await client.query('delete from public.form_approvals where document_id=$1::uuid', [document.id]);
      const steps = await resolveFormApprovers(
        client,
        context.organizationId,
        String(document.form_type),
        document.employee_id ? String(document.employee_id) : null,
      );
      for (const step of steps) {
        await client.query(
          `insert into public.form_approvals(
             organization_id,document_id,step_order,approver_user_id,approver_role,status
           ) values($1::uuid,$2::uuid,$3,$4::uuid,$5,'pending')`,
          [context.organizationId, document.id, step.stepOrder, step.approverUserId, step.approverRole],
        );
      }
      nextStatus = steps.length ? 'pending_approval' : 'submitted';
      currentApprovalStep = steps[0]?.stepOrder ?? 0;
    } else if (['approve', 'reject', 'return'].includes(input.action)) {
      if (!['submitted', 'pending_approval'].includes(currentStatus)) {
        throw Object.assign(new Error('INVALID_TRANSITION'), { status: 409 });
      }
      const pending = await client.query(
        `select id,step_order,approver_user_id
         from public.form_approvals
         where document_id=$1::uuid and organization_id=$2::uuid and status='pending'
         order by step_order limit 1 for update`,
        [document.id, context.organizationId],
      );
      const approval = pending.rows[0];
      if (!approval) throw Object.assign(new Error('NO_PENDING_APPROVAL'), { status: 409 });
      if (String(approval.approver_user_id) !== String(context.user.id) && !elevated) {
        throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      }
      const approvalStatus = input.action === 'approve' ? 'approved' : input.action === 'reject' ? 'rejected' : 'returned';
      await client.query(
        `update public.form_approvals
         set status=$1,acted_at=now(),comment=$2
         where id=$3::uuid`,
        [approvalStatus, input.comment || null, approval.id],
      );
      await client.query(
        `insert into public.form_signatures(submission_id,user_id,action,display_name,comment)
         select s.id,$1::uuid,$2,$3,$4
         from public.form_submissions s
         where s.organization_id=$5::uuid and s.document_number=$6`,
        [context.user.id, approvalStatus, context.user.name || context.user.email, input.comment || null, context.organizationId, document.document_no],
      );

      if (input.action === 'approve') {
        const next = await client.query(
          `select step_order from public.form_approvals
           where document_id=$1::uuid and status='pending'
           order by step_order limit 1`,
          [document.id],
        );
        nextStatus = next.rows[0] ? 'pending_approval' : 'approved';
        currentApprovalStep = Number(next.rows[0]?.step_order || 0);
      } else {
        await client.query(
          `update public.form_approvals
           set status='skipped',acted_at=now(),comment=coalesce(comment,$2)
           where document_id=$1::uuid and status='pending'`,
          [document.id, input.action === 'reject' ? 'أغلق المسار بسبب رفض المستند' : 'أغلق المسار بسبب إعادة المستند للتعديل'],
        );
        nextStatus = input.action === 'reject' ? 'rejected' : 'returned_for_edit';
      }
    } else if (input.action === 'cancel') {
      if (!['draft', 'submitted', 'pending_approval', 'returned_for_edit'].includes(currentStatus)) {
        throw Object.assign(new Error('INVALID_TRANSITION'), { status: 409 });
      }
      if (!ownDocument && !elevated) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      await client.query(
        `update public.form_approvals set status='cancelled',acted_at=now(),comment=coalesce(comment,$2)
         where document_id=$1::uuid and status='pending'`,
        [document.id, input.comment || 'أُلغي المستند'],
      );
      nextStatus = 'cancelled';
    } else {
      if (!['approved', 'issued'].includes(currentStatus)) {
        throw Object.assign(new Error('INVALID_TRANSITION'), { status: 409 });
      }
      nextStatus = 'archived';
    }

    await client.query(
      `update public.form_documents set
         status=$1,updated_by=$2::uuid,updated_at=now(),
         submitted_at=case when $3='submit' then coalesce(submitted_at,now()) else submitted_at end,
         approved_at=case when $1='approved' then coalesce(approved_at,now()) else approved_at end
       where id=$4::uuid`,
      [nextStatus, context.user.id, input.action, document.id],
    );
    await client.query(
      `update public.form_submissions set
         status=$1,current_approval_step=$2,updated_at=now(),
         submitted_at=case when $3='submit' then coalesce(submitted_at,now()) else submitted_at end,
         approved_at=case when $1='approved' then coalesce(approved_at,now()) else approved_at end,
         rejected_at=case when $1='rejected' then now() else rejected_at end,
         cancelled_at=case when $1='cancelled' then now() else cancelled_at end
       where organization_id=$4::uuid and document_number=$5`,
      [nextStatus, currentApprovalStep, input.action, context.organizationId, document.document_no],
    );
    if (nextStatus === 'approved') {
      const submission = await client.query(
        `select id,employee_id from public.form_submissions
         where organization_id=$1::uuid and document_number=$2 limit 1`,
        [context.organizationId, document.document_no],
      );
      if (submission.rows[0]) {
        const payloadResult = await client.query(
          `select payload from public.form_documents where id=$1::uuid`,
          [document.id],
        );
        await syncFormDomainRecords(client, {
          organizationId: context.organizationId,
          submissionId: String(submission.rows[0].id),
          formType: String(document.form_type),
          employeeId: submission.rows[0].employee_id ? String(submission.rows[0].employee_id) : null,
          createdBy: context.user.id,
          payload: payloadResult.rows[0]?.payload || {},
        });
      }
    }
    await client.query(
      `insert into public.form_status_history(
         organization_id,document_id,from_status,to_status,actor_user_id,comment
       ) values($1::uuid,$2::uuid,$3,$4,$5::uuid,$6)`,
      [context.organizationId, document.id, currentStatus, nextStatus, context.user.id, input.comment || null],
    );
    await client.query(
      `insert into public.audit_logs(
         organization_id,user_id,action,entity_type,entity_id,old_values,new_values,reason
       ) values($1::uuid,$2::uuid,$3,'form_document',$4::uuid,$5::jsonb,$6::jsonb,$7)`,
      [
        context.organizationId,
        context.user.id,
        `form.${input.action}`,
        document.id,
        JSON.stringify({ status: currentStatus }),
        JSON.stringify({ status: nextStatus, current_approval_step: currentApprovalStep }),
        input.comment || null,
      ],
    );
    await client.query('commit');
    return { id: String(document.id), status: nextStatus, currentApprovalStep };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
