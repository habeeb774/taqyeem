import { NextRequest } from 'next/server';
import { z } from 'zod';
import { pool } from '@/db';
import { allVisibleEmployeeIds } from '@/db/queries/security';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser, must, can, assertEmployeeAccess } from '@/server/context';
import { getEmployeeFormProfile } from '@/server/forms/employee-mapper';
import { saveFormDocument } from '@/server/forms/submissions';
import { saveFormTemplate } from '@/server/forms/templates';
import { transitionFormDocument } from '@/server/forms/transitions';

const documentSchema = z.object({
  form_type: z.string().min(1).max(80),
  document_no: z.string().min(1).max(120),
  employee_id: z.string().uuid().nullable().optional(),
  employee_snapshot: z.record(z.any()).nullable().optional(),
  candidate_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'issued']).default('draft'),
  payload: z.record(z.any()).default({}),
});

const templateSchema = z.object({
  template_key: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  category: z.string().max(80).default('other'),
  icon: z.string().max(80).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  definition: z.record(z.any()).default({}),
});

const transitionActionSchema = z.enum(['submit', 'approve', 'reject', 'return', 'cancel', 'archive']);
const transitionActions = new Set(transitionActionSchema.options);

async function nextDocumentNumber(context: Awaited<ReturnType<typeof requireUser>>, body: any) {
  must(context, 'forms.create');
  const prefix = z.string().min(1).max(30).parse(body.prefix || 'HR');
  const key = z.string().min(1).max(80).parse(body.sequence_key || prefix);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const result = await client.query(
      `insert into public.document_sequences(organization_id,sequence_key,prefix,next_value)
       values($1::uuid,$2,$3,2)
       on conflict(organization_id,sequence_key) do update
       set next_value=document_sequences.next_value+1,updated_at=now()
       returning prefix,next_value-1 as value`,
      [context.organizationId, key, prefix],
    );
    await client.query('commit');
    return `${result.rows[0].prefix}-${String(result.rows[0].value).padStart(4, '0')}`;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'forms.view');
    const query = new URL(req.url).searchParams;
    if (query.get('templates') === '1') {
      const result = await pool.query(
        `select id,template_key,name,category,icon,description,definition,active
         from public.form_templates
         where organization_id=$1::uuid and active=true
         order by created_at`,
        [context.organizationId],
      );
      return jsonOk({ templates: result.rows });
    }
    if (query.get('approvals') === '1') {
      const canReviewAll = context.roles.some((role) => role.code === 'super_admin' || role.code === 'hr_admin');
      const result = await pool.query(
        `select a.*,d.document_no,d.form_type,d.employee_id,d.payload
         from public.form_approvals a
         join public.form_documents d on d.id=a.document_id and d.deleted_at is null
         where a.organization_id=$1::uuid
           and (a.approver_user_id=$2::uuid or $3::boolean)
           and a.status='pending'
           and a.step_order=(
             select min(a2.step_order)
             from public.form_approvals a2
             where a2.document_id=a.document_id and a2.status='pending'
           )
         order by a.created_at`,
        [context.organizationId, context.user.id, canReviewAll],
      );
      return jsonOk({ approvals: result.rows });
    }
    const page = Math.max(1, Number(query.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(query.get('limit') || 50)));
    const offset = (page - 1) * limit;
    const search = (query.get('q') || '').trim();
    const type = query.get('type') || '';
    const status = query.get('status') || '';
    const archiveOnly = query.get('archive') === '1';
    const viewAll = can(context, 'forms.view_all');
    const visibleEmployeeIds = viewAll ? [] : await allVisibleEmployeeIds(context);
    const result = await pool.query(`
      select d.*,e.full_name employee_name,e.employee_number,b.name branch_name,
             dep.name department_name,coalesce(p.full_name,u.name,u.email) creator_name,
             count(*) over()::int total_count
      from public.form_documents d
      left join public.employees e on e.id=d.employee_id
      left join public.branches b on b.id=e.branch_id
      left join public.departments dep on dep.id=e.department_id
      left join public.users u on u.id=d.created_by
      left join public.profiles p on p.id=u.id
      where d.organization_id=$1::uuid and d.deleted_at is null
        and ($2='' or d.form_type=$2) and ($3='' or d.status=$3)
        and (not $4::boolean or d.form_type<>'__draft__')
        and ($5::boolean or d.created_by=$6::uuid or d.employee_id=any($7::uuid[]))
        and ($8='' or d.document_no ilike '%'||$8||'%' or d.form_type ilike '%'||$8||'%'
          or coalesce(d.payload->>'formName','') ilike '%'||$8||'%'
          or coalesce(e.full_name,'') ilike '%'||$8||'%' or coalesce(e.employee_number,'') ilike '%'||$8||'%'
          or coalesce(b.name,'') ilike '%'||$8||'%' or coalesce(dep.name,'') ilike '%'||$8||'%'
          or coalesce(p.full_name,u.name,u.email,'') ilike '%'||$8||'%')
      order by d.updated_at desc limit $9 offset $10`, [context.organizationId, type, status, archiveOnly, viewAll, context.user.id, visibleEmployeeIds, search, limit, offset]);
    const total = Number(result.rows[0]?.total_count || 0);
    const documents = result.rows.map(({ total_count: _totalCount, ...row }) => row);
    return jsonOk({
      documents,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: offset + documents.length < total,
    });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'forms.manage_templates');
    const template = await saveFormTemplate(context, templateSchema.parse(await req.json()));
    return jsonOk({ template });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await requireUser();
    const body = await req.json();
    if (body.action === 'next_number') {
      return jsonOk({ document_no: await nextDocumentNumber(context, body) });
    }

    if (transitionActions.has(body.action)) {
      const result = await transitionFormDocument(context, {
        documentId: z.string().uuid().parse(body.document_id),
        action: transitionActionSchema.parse(body.action),
        comment: z.string().max(1000).nullable().optional().parse(body.comment),
      });
      return jsonOk({ status: result.status, current_approval_step: result.currentApprovalStep });
    }

    must(context, 'forms.create');
    const value = documentSchema.parse(body);
    const employeeSnapshot = value.employee_id ? await getEmployeeFormProfile(context, value.employee_id) : value.employee_snapshot || {};
    const document = await saveFormDocument(context, {
      formType: value.form_type,
      documentNumber: value.document_no,
      employeeId: value.employee_id || null,
      candidateId: value.candidate_id || null,
      employeeSnapshot,
      payload: value.payload,
      status: value.status,
    });
    return jsonOk({ document });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const context = await requireUser();
    const documentNumber = z.string().min(1).max(120).parse(new URL(req.url).searchParams.get('document_no') || '');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await client.query(`select id,employee_id,status,form_type,created_by from public.form_documents where organization_id=$1::uuid and document_no=$2 and deleted_at is null for update`, [context.organizationId, documentNumber]);
      const document = result.rows[0];
      if (!document) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      const ownDraft = document.form_type === '__draft__' && String(document.created_by) === String(context.user.id) && can(context, 'forms.create');
      if (!ownDraft) must(context, 'forms.delete');
      if (document.employee_id && !can(context, 'forms.view_all')) await assertEmployeeAccess(context, String(document.employee_id));
      await client.query(`update public.form_documents set deleted_at=now(),updated_by=$1::uuid,updated_at=now() where id=$2::uuid`, [context.user.id, document.id]);
      await client.query(`update public.form_submissions set deleted_at=now(),updated_at=now() where organization_id=$1::uuid and document_number=$2`, [context.organizationId, documentNumber]);
      await client.query(`insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values) values($1::uuid,$2::uuid,'form.delete','form_document',$3::uuid,$4::jsonb,$5::jsonb)`, [context.organizationId, context.user.id, document.id, JSON.stringify({ status: document.status }), JSON.stringify({ deleted_at: new Date().toISOString() })]);
      await client.query('commit');
      return jsonOk({});
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return jsonFail(error);
  }
}
