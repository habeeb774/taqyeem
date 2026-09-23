import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { dbFieldValues, fieldInput } from '@/server/designs';
import { jsonError, must, requireUser } from '@/server/context';

async function writeFieldAudit(
  action: 'update' | 'delete',
  context: Awaited<ReturnType<typeof requireUser>>,
  fieldId: string,
  values: Record<string, unknown>,
) {
  await pool.query(
    `
      insert into public.audit_logs(
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        ${action === 'delete' ? 'old_values' : 'new_values'}
      )
      values(
        $1::uuid,
        $2::uuid,
        $3,
        'design_template_field',
        $4::uuid,
        $5::jsonb
      )
    `,
    [
      context.organizationId,
      context.user.id,
      `design_template_field.${action}`,
      fieldId,
      JSON.stringify(values),
    ],
  );
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.manage_fields');

    const { id } = await params;
    z.string().uuid().parse(id);

    const field = fieldInput.parse(await req.json());
    const result = await pool.query(
      `
        update public.design_template_fields f
        set layer_name = $3,
            field_key = $4,
            field_label = $5,
            field_type = $6,
            content = $7,
            default_value = $8,
            placeholder = $9,
            is_dynamic = $10,
            is_required = $11,
            x = $12,
            y = $13,
            width = $14,
            height = $15,
            font_family = $16,
            font_size = $17,
            font_weight = $18,
            font_color = $19,
            text_align = $20,
            direction = $21,
            line_height = $22,
            letter_spacing = $23,
            rotation = $24,
            opacity = $25,
            multiline = $26,
            auto_fit = $27,
            min_font_size = $28,
            max_font_size = $29,
            max_length = $30,
            is_visible = $31,
            is_locked = $32,
            z_index = $33,
            sort_order = $34,
            options = $35::jsonb,
            updated_at = now()
        from public.design_templates t
        where f.template_id = t.id
          and f.id = $1::uuid
          and t.organization_id = $2::uuid
          and t.deleted_at is null
        returning f.*
      `,
      [id, context.organizationId, ...dbFieldValues(field)],
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { ok: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    await writeFieldAudit('update', context, id, {
      template_id: result.rows[0].template_id,
      layer_name: field.layer_name,
      field_key: field.field_key,
    });

    return NextResponse.json({ ok: true, field: result.rows[0] });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.manage_fields');

    const { id } = await params;
    z.string().uuid().parse(id);

    const result = await pool.query(
      `
        delete from public.design_template_fields f
        using public.design_templates t
        where f.template_id = t.id
          and f.id = $1::uuid
          and t.organization_id = $2::uuid
        returning f.id, f.template_id, f.layer_name, f.field_key
      `,
      [id, context.organizationId],
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { ok: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    await writeFieldAudit('delete', context, id, {
      template_id: result.rows[0].template_id,
      layer_name: result.rows[0].layer_name,
      field_key: result.rows[0].field_key,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
