import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { resolveTemplate, templateItems } from '@/db/queries/evaluations';
import { withNeonTransaction } from '@/lib/neon/admin';
import {
  assertEmployeeAccess,
  jsonError,
  must,
  requireUser,
} from '@/server/context';

const saveCriteriaSchema = z.object({
  employee_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        name: z.string().min(2),
        description: z.string().optional().default(''),
        max_score: z.number().positive().default(5),
        weight: z.number().positive().default(1),
        mandatory: z.boolean().default(true),
        visible_to_employee: z.boolean().default(true),
        comment_required: z.boolean().default(false),
      }),
    )
    .min(1),
});

function createCriterionCode(employeeId: string, version: number, index: number) {
  const employeePrefix = employeeId.replace(/-/g, '').slice(0, 8);
  const uniqueSuffix = Date.now().toString(36).toUpperCase();

  return `EMP_${employeePrefix}_V${version}_${index + 1}_${uniqueSuffix}`;
}

async function getTemplate(templateId: string) {
  const result = await pool.query(
    `
      select id, name, scope_type, scope_id, version
      from public.evaluation_templates
      where id = $1::uuid
    `,
    [templateId],
  );

  return result.rows[0];
}

async function deactivateEmployeeTemplates(
  tx: Pick<typeof pool, 'query'>,
  organizationId: string,
  employeeId: string,
) {
  await tx.query(
    `
      update public.evaluation_templates
      set active = false,
          updated_at = now()
      where organization_id = $1::uuid
        and scope_type = 'employee'
        and scope_id = $2::uuid
        and active = true
    `,
    [organizationId, employeeId],
  );
}

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'evaluations.view');

    const employeeId = z
      .string()
      .uuid()
      .parse(new URL(req.url).searchParams.get('employee_id'));

    await assertEmployeeAccess(context, employeeId);

    const templateId = await resolveTemplate(context.organizationId, employeeId);
    if (!templateId) {
      return NextResponse.json({ ok: true, template_id: null, items: [] });
    }

    const template = await getTemplate(templateId);
    const items = (await templateItems(templateId)).map((item: any) => ({
      ...item,
      max_score: Number(item.max_score),
      weight: Number(item.weight),
    }));

    return NextResponse.json({ ok: true, template, items });
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
    must(context, 'criteria.manage');

    const body = await req.json();
    if (body?.action === 'reset') {
      const employeeId = z.string().uuid().parse(body.employee_id);
      await assertEmployeeAccess(context, employeeId);
      await deactivateEmployeeTemplates(pool, context.organizationId, employeeId);

      return NextResponse.json({ ok: true });
    }

    const payload = saveCriteriaSchema.parse(body);
    await assertEmployeeAccess(context, payload.employee_id);

    let templateId = '';
    let version = 1;

    await withNeonTransaction(async (tx) => {
      const versionResult = await tx.query(
        `
          select coalesce(max(version), 0)::int + 1 v
          from public.evaluation_templates
          where organization_id = $1::uuid
            and scope_type = 'employee'
            and scope_id = $2::uuid
        `,
        [context.organizationId, payload.employee_id],
      );

      version = Number(versionResult.rows[0].v);
      await deactivateEmployeeTemplates(
        tx,
        context.organizationId,
        payload.employee_id,
      );

      const templateResult = await tx.query(
        `
          insert into public.evaluation_templates(
            organization_id,
            name,
            description,
            scope_type,
            scope_id,
            active,
            version,
            created_by
          )
          values(
            $1::uuid,
            'معايير مخصصة للموظف',
            'تم إنشاؤها من واجهة التقييم الأصلية',
            'employee',
            $2::uuid,
            true,
            $3,
            $4::uuid
          )
          returning id
        `,
        [
          context.organizationId,
          payload.employee_id,
          version,
          context.user.id,
        ],
      );

      templateId = String(templateResult.rows[0].id);

      for (let index = 0; index < payload.items.length; index += 1) {
        const item = payload.items[index];
        const code = createCriterionCode(payload.employee_id, version, index);
        const criterionResult = await tx.query(
          `
            insert into public.evaluation_criteria(
              organization_id,
              code,
              name,
              description,
              max_score,
              mandatory,
              visible_to_employee,
              comment_required,
              active,
              created_by
            )
            values($1::uuid, $2, $3, $4, $5, $6, $7, $8, true, $9::uuid)
            returning id
          `,
          [
            context.organizationId,
            code,
            item.name,
            item.description || null,
            item.max_score,
            item.mandatory,
            item.visible_to_employee,
            item.comment_required,
            context.user.id,
          ],
        );

        await tx.query(
          `
            insert into public.template_criteria(
              template_id,
              criterion_id,
              weight,
              sort_order,
              mandatory,
              visible_to_employee,
              comment_required
            )
            values($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
          `,
          [
            templateId,
            criterionResult.rows[0].id,
            item.weight,
            index,
            item.mandatory,
            item.visible_to_employee,
            item.comment_required,
          ],
        );
      }

      await tx.query(
        `
          insert into public.audit_logs(
            organization_id,
            user_id,
            action,
            entity_type,
            entity_id,
            new_values
          )
          values(
            $1::uuid,
            $2::uuid,
            'criteria.customize',
            'evaluation_template',
            $3::uuid,
            $4::jsonb
          )
        `,
        [
          context.organizationId,
          context.user.id,
          templateId,
          JSON.stringify({
            employee_id: payload.employee_id,
            version,
            count: payload.items.length,
          }),
        ],
      );
    });

    return NextResponse.json({ ok: true, template_id: templateId, version });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
