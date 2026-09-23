import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';

const stepSchema = z.object({
  approver_type: z.enum(['employee','direct_manager','department_manager','branch_manager','role','user']),
  approver_role_id: z.string().uuid().nullable().optional(),
  approver_user_id: z.string().uuid().nullable().optional(),
  title: z.string().max(160).nullable().optional(),
  required: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.approver_type === 'role' && !value.approver_role_id) context.addIssue({ code: 'custom', message: 'ROLE_REQUIRED' });
  if (value.approver_type === 'user' && !value.approver_user_id) context.addIssue({ code: 'custom', message: 'USER_REQUIRED' });
});

const workflowSchema = z.object({
  template_id: z.string().uuid(),
  name: z.string().min(2).max(160),
  steps: z.array(stepSchema).min(1).max(20),
});

export async function GET() {
  try {
    const context = await requireUser();
    must(context, 'forms.manage_workflows');
    const [result,templates,roles,users] = await Promise.all([pool.query(`
      select w.id,w.template_id,w.name,w.active,w.created_at,
             t.template_key,t.name template_name,
             coalesce(json_agg(json_build_object(
               'id',s.id,'step_order',s.step_order,'approver_type',s.approver_type,
               'approver_role_id',s.approver_role_id,'approver_user_id',s.approver_user_id,
               'title',s.title,'required',s.required
             ) order by s.step_order) filter(where s.id is not null),'[]') steps
      from public.form_workflows w
      join public.form_templates t on t.id=w.template_id
      left join public.form_approval_steps s on s.workflow_id=w.id
      where w.organization_id=$1::uuid
      group by w.id,t.template_key,t.name
      order by t.name,w.created_at desc`, [context.organizationId]),
      pool.query(`select id,template_key,name from public.form_templates where organization_id=$1::uuid and active=true order by name`,[context.organizationId]),
      pool.query(`select id,code,name_ar from public.roles where active=true and (organization_id is null or organization_id=$1::uuid) order by name_ar`,[context.organizationId]),
      pool.query(`select id,name,email from public.users where organization_id=$1::uuid and active=true order by name,email`,[context.organizationId]),
    ]);
    return NextResponse.json({ ok: true, workflows: result.rows, templates: templates.rows, roles: roles.rows, users: users.rows });
  } catch (error) {
    const failure = jsonError(error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
}

export async function PUT(request: Request) {
  try {
    const context = await requireUser();
    must(context, 'forms.manage_workflows');
    const input = workflowSchema.parse(await request.json());
    const client = await pool.connect();
    try {
      await client.query('begin');
      const template = await client.query(
        `select id from public.form_templates where id=$1::uuid and organization_id=$2::uuid and active=true for update`,
        [input.template_id, context.organizationId],
      );
      if (!template.rows[0]) throw Object.assign(new Error('TEMPLATE_NOT_FOUND'), { status: 404 });
      await client.query(
        `update public.form_workflows set active=false,updated_at=now()
         where template_id=$1::uuid and organization_id=$2::uuid`,
        [input.template_id, context.organizationId],
      );
      const workflow = await client.query(
        `insert into public.form_workflows(organization_id,template_id,name,active,created_by)
         values($1::uuid,$2::uuid,$3,true,$4::uuid)
         on conflict(template_id,name) do update set active=true,updated_at=now()
         returning id`,
        [context.organizationId, input.template_id, input.name, context.user.id],
      );
      await client.query('delete from public.form_approval_steps where workflow_id=$1::uuid', [workflow.rows[0].id]);
      for (const [index, step] of input.steps.entries()) {
        if (step.approver_role_id) {
          const role = await client.query(
            `select id from public.roles where id=$1::uuid and active=true and (organization_id is null or organization_id=$2::uuid)`,
            [step.approver_role_id, context.organizationId],
          );
          if (!role.rows[0]) throw Object.assign(new Error('ROLE_NOT_FOUND'), { status: 404 });
        }
        if (step.approver_user_id) {
          const user = await client.query(
            `select id from public.users where id=$1::uuid and organization_id=$2::uuid and active=true`,
            [step.approver_user_id, context.organizationId],
          );
          if (!user.rows[0]) throw Object.assign(new Error('USER_NOT_FOUND'), { status: 404 });
        }
        await client.query(
          `insert into public.form_approval_steps(
             workflow_id,step_order,approver_type,approver_role_id,approver_user_id,title,required
           ) values($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7)`,
          [workflow.rows[0].id, index + 1, step.approver_type, step.approver_role_id || null, step.approver_user_id || null, step.title || null, step.required],
        );
      }
      await client.query(
        `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
         values($1::uuid,$2::uuid,'form.workflow.update','form_workflow',$3::uuid,$4::jsonb)`,
        [context.organizationId, context.user.id, workflow.rows[0].id, JSON.stringify({ template_id: input.template_id, name: input.name, steps: input.steps })],
      );
      await client.query('commit');
      return NextResponse.json({ ok: true, id: workflow.rows[0].id });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const failure = jsonError(error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
}
