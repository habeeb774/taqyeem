import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';

async function readSourceField(fieldId: string, organizationId: string) {
  const source = await pool.query(
    `
      select f.*
      from public.design_template_fields f
      join public.design_templates t on t.id = f.template_id
      where f.id = $1::uuid
        and t.organization_id = $2::uuid
        and t.deleted_at is null
    `,
    [fieldId, organizationId],
  );

  return source.rows[0];
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.manage_fields');

    const { id } = await params;
    z.string().uuid().parse(id);

    const source = await readSourceField(id, context.organizationId);
    if (!source) {
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
          $1,
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
          $34
        )
        returning *
      `,
      [
        source.template_id,
        `${source.layer_name} - نسخة`,
        `${source.field_key}_copy_${Date.now().toString(36)}`,
        source.field_label,
        source.field_type,
        source.content,
        source.default_value,
        source.placeholder,
        source.is_dynamic,
        source.is_required,
        Number(source.x) + 12,
        Number(source.y) + 12,
        source.width,
        source.height,
        source.font_family,
        source.font_size,
        source.font_weight,
        source.font_color,
        source.text_align,
        source.direction,
        source.line_height,
        source.letter_spacing,
        source.rotation,
        source.opacity,
        source.multiline,
        source.auto_fit,
        source.min_font_size,
        source.max_font_size,
        source.max_length,
        source.is_visible,
        false,
        Number(source.z_index) + 1,
        Number(source.sort_order) + 1,
        source.options,
      ],
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
          'design_template_field.duplicate',
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
          template_id: source.template_id,
          source_field_id: id,
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
