import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { dbFieldValues, fieldInput } from '@/server/designs';
import { jsonError, must, requireUser } from '@/server/context';

async function templateExists(templateId: string, organizationId: string) {
  const owner = await pool.query(
    `
      select 1
      from public.design_templates
      where id = $1::uuid
        and organization_id = $2::uuid
        and deleted_at is null
    `,
    [templateId, organizationId],
  );

  return Boolean(owner.rows[0]);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.manage_fields');

    const { id } = await params;
    z.string().uuid().parse(id);

    const field = fieldInput.parse(await req.json());
    if (!(await templateExists(id, context.organizationId))) {
      return NextResponse.json(
        { ok: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const result = await pool.query(
      `
        insert into public.design_template_fields(
          template_id,
          layer_name,
          field_key,
          field_label,
          field_type,
          content,
          default_value,
          placeholder,
          is_dynamic,
          is_required,
          x,
          y,
          width,
          height,
          font_family,
          font_size,
          font_weight,
          font_color,
          text_align,
          direction,
          line_height,
          letter_spacing,
          rotation,
          opacity,
          multiline,
          auto_fit,
          min_font_size,
          max_font_size,
          max_length,
          is_visible,
          is_locked,
          z_index,
          sort_order,
          options
        )
        values(
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          $22,
          $23,
          $24,
          $25,
          $26,
          $27,
          $28,
          $29,
          $30,
          $31,
          $32,
          $33,
          $34::jsonb
        )
        returning *
      `,
      [id, ...dbFieldValues(field)],
    );

    await pool.query(
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
          'design_template_field.create',
          'design_template_field',
          $3::uuid,
          $4::jsonb
        )
      `,
      [
        context.organizationId,
        context.user.id,
        result.rows[0].id,
        JSON.stringify({
          template_id: id,
          layer_name: field.layer_name,
          field_key: field.field_key,
        }),
      ],
    );

    return NextResponse.json(
      { ok: true, field: result.rows[0] },
      { status: 201 },
    );
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
