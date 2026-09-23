import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';

const reorderSchema = z.object({
  template_id: z.string().uuid(),
  field_ids: z
    .array(z.string().uuid())
    .min(1)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Duplicate field ids are not allowed',
    ),
});

export async function POST(req: Request) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.manage_fields');

    const payload = reorderSchema.parse(await req.json());
    const owner = await pool.query(
      `
        select 1
        from public.design_templates
        where id = $1::uuid
          and organization_id = $2::uuid
          and deleted_at is null
      `,
      [payload.template_id, context.organizationId],
    );

    if (!owner.rows[0]) {
      return NextResponse.json(
        { ok: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const client = await pool.connect();
    try {
      await client.query('begin');

      const fields = await client.query(
        `
          select id
          from public.design_template_fields
          where template_id = $1::uuid
            and id = any($2::uuid[])
          for update
        `,
        [payload.template_id, payload.field_ids],
      );

      if (fields.rows.length !== payload.field_ids.length) {
        throw Object.assign(new Error('INVALID_FIELDS'), { status: 400 });
      }

      for (const [index, fieldId] of payload.field_ids.entries()) {
        await client.query(
          `
            update public.design_template_fields
            set z_index = $1,
                sort_order = $1,
                updated_at = now()
            where id = $2::uuid
              and template_id = $3::uuid
          `,
          [index + 1, fieldId, payload.template_id],
        );
      }

      await client.query(
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
            'design_template_field.reorder',
            'design_template',
            $3::uuid,
            $4::jsonb
          )
        `,
        [
          context.organizationId,
          context.user.id,
          payload.template_id,
          JSON.stringify({ field_ids: payload.field_ids }),
        ],
      );

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
