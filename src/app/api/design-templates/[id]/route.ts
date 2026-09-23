import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

import { pool } from '@/db';
import { can, jsonError, must, requireUser } from '@/server/context';
import { dbFieldValues, fieldInput, templateInput } from '@/server/designs';

const updateSchema = templateInput.partial().extend({
  fields: z.array(fieldInput.extend({ id: z.string().uuid().optional() })).optional(),
});

type Context = Awaited<ReturnType<typeof requireUser>>;
type UpdatePayload = z.infer<typeof updateSchema>;

async function readTemplate(
  id: string,
  context: Context,
  canManageTemplate: boolean,
) {
  return pool.query(
    `
      select
        t.*,
        c.name category_name,
        u.name created_by_name
      from public.design_templates t
      left join public.design_categories c on c.id = t.category_id
      left join public.users u on u.id = t.created_by
      where t.id = $1::uuid
        and t.organization_id = $2::uuid
        and t.deleted_at is null
        and ($3::boolean or t.status = 'published')
    `,
    [id, context.organizationId, canManageTemplate],
  );
}

function readTemplateFields(id: string) {
  return pool.query(
    `
      select *
      from public.design_template_fields
      where template_id = $1::uuid
      order by z_index, sort_order
    `,
    [id],
  );
}

async function assertCategoryIsValid(
  client: Pick<typeof pool, 'query'>,
  context: Context,
  categoryId?: string | null,
) {
  if (!categoryId) return;

  const category = await client.query(
    `
      select 1
      from public.design_categories
      where id = $1::uuid
        and organization_id = $2::uuid
        and is_active = true
    `,
    [categoryId, context.organizationId],
  );

  if (!category.rows[0]) {
    throw Object.assign(new Error('INVALID_CATEGORY'), { status: 400 });
  }
}

async function updateTemplateRecord(
  client: Pick<typeof pool, 'query'>,
  id: string,
  context: Context,
  payload: UpdatePayload,
) {
  await client.query(
    `
      update public.design_templates
      set name = coalesce($3, name),
          description = case when $4 then $5 else description end,
          category_id = case when $6 then $7::uuid else category_id end,
          background_image_url = case
            when $8 then $9
            else background_image_url
          end,
          background_storage_key = case
            when $10 then $11
            else background_storage_key
          end,
          thumbnail_url = case when $12 then $13 else thumbnail_url end,
          thumbnail_storage_key = case
            when $14 then $15
            else thumbnail_storage_key
          end,
          width = coalesce($16, width),
          height = coalesce($17, height),
          status = coalesce($18, status),
          notes = case when $19 then $20 else notes end,
          updated_by = $21::uuid,
          updated_at = now()
      where id = $1::uuid
        and organization_id = $2::uuid
    `,
    [
      id,
      context.organizationId,
      payload.name || null,
      'description' in payload,
      payload.description || null,
      'category_id' in payload,
      payload.category_id || null,
      'background_image_url' in payload,
      payload.background_image_url || null,
      'background_storage_key' in payload,
      payload.background_storage_key || null,
      'thumbnail_url' in payload,
      payload.thumbnail_url || null,
      'thumbnail_storage_key' in payload,
      payload.thumbnail_storage_key || null,
      payload.width || null,
      payload.height || null,
      payload.status || null,
      'notes' in payload,
      payload.notes || null,
      context.user.id,
    ],
  );
}

async function upsertField(
  client: Pick<typeof pool, 'query'>,
  templateId: string,
  rawField: z.infer<typeof fieldInput> & { id?: string },
  index: number,
) {
  const field = fieldInput.parse({
    ...rawField,
    z_index: rawField.z_index || index + 1,
    sort_order: rawField.sort_order || index + 1,
  });

  if (rawField.id) {
    const updated = await client.query(
      `
        update public.design_template_fields
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
        where id = $1::uuid
          and template_id = $2::uuid
        returning id
      `,
      [rawField.id, templateId, ...dbFieldValues(field)],
    );

    return updated.rows[0]?.id ? String(updated.rows[0].id) : null;
  }

  const inserted = await client.query(
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
      returning id
    `,
    [templateId, ...dbFieldValues(field)],
  );

  return String(inserted.rows[0].id);
}

async function saveFields(
  client: Pick<typeof pool, 'query'>,
  templateId: string,
  fields: NonNullable<UpdatePayload['fields']>,
) {
  const keep: string[] = [];

  for (const [index, rawField] of fields.entries()) {
    const fieldId = await upsertField(client, templateId, rawField, index);
    if (fieldId) keep.push(fieldId);
  }

  await client.query(
    `
      delete from public.design_template_fields
      where template_id = $1::uuid
        and not(id = any($2::uuid[]))
    `,
    [templateId, keep],
  );

  return (
    await client.query(
      `
        select *
        from public.design_template_fields
        where template_id = $1::uuid
        order by z_index, sort_order
      `,
      [templateId],
    )
  ).rows;
}

async function assertTemplateReadyToPublish(
  client: Pick<typeof pool, 'query'>,
  id: string,
) {
  const ready = await client.query(
    `
      select
        t.background_image_url,
        (
          select count(*)::int
          from public.design_template_fields f
          where f.template_id = t.id
        ) field_count
      from public.design_templates t
      where t.id = $1::uuid
    `,
    [id],
  );

  if (!ready.rows[0]?.background_image_url) {
    throw Object.assign(new Error('BACKGROUND_REQUIRED'), { status: 409 });
  }

  if (Number(ready.rows[0]?.field_count || 0) < 1) {
    throw Object.assign(new Error('TEXT_LAYER_REQUIRED'), { status: 409 });
  }
}

async function writeUpdateAudit(
  client: Pick<typeof pool, 'query'>,
  context: Context,
  id: string,
  oldTemplate: any,
  payload: UpdatePayload,
) {
  await client.query(
    `
      insert into public.audit_logs(
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values
      )
      values(
        $1::uuid,
        $2::uuid,
        'design_template.update',
        'design_template',
        $3::uuid,
        $4::jsonb,
        $5::jsonb
      )
    `,
    [
      context.organizationId,
      context.user.id,
      id,
      JSON.stringify({ status: oldTemplate.status }),
      JSON.stringify({
        status: payload.status || oldTemplate.status,
        field_count: payload.fields?.length,
      }),
    ],
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.view');

    const { id } = await params;
    z.string().uuid().parse(id);

    const canManageTemplate =
      can(context, 'design_templates.edit') ||
      can(context, 'design_templates.publish');

    const [template, fields] = await Promise.all([
      readTemplate(id, context, canManageTemplate),
      readTemplateFields(id),
    ]);

    if (!template.rows[0]) {
      return NextResponse.json(
        { ok: false, error: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      template: template.rows[0],
      fields: fields.rows,
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.edit');

    const { id } = await params;
    z.string().uuid().parse(id);

    const payload = updateSchema.parse(await req.json());
    if (payload.fields) must(context, 'design_templates.manage_fields');

    const client = await pool.connect();
    let persistedFields: any[] | undefined;

    try {
      await client.query('begin');

      const oldTemplate = await client.query(
        `
          select *
          from public.design_templates
          where id = $1::uuid
            and organization_id = $2::uuid
            and deleted_at is null
          for update
        `,
        [id, context.organizationId],
      );

      if (!oldTemplate.rows[0]) {
        throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      }

      await assertCategoryIsValid(client, context, payload.category_id);
      await updateTemplateRecord(client, id, context, payload);

      if (payload.fields) {
        persistedFields = await saveFields(client, id, payload.fields);
      }

      if (payload.status === 'published') {
        must(context, 'design_templates.publish');
        await assertTemplateReadyToPublish(client, id);
      }

      await writeUpdateAudit(client, context, id, oldTemplate.rows[0], payload);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, fields: persistedFields });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.delete');

    const { id } = await params;
    z.string().uuid().parse(id);

    const client = await pool.connect();
    try {
      await client.query('begin');

      const deleted = await client.query(
        `
          update public.design_templates
          set deleted_at = now(),
              status = 'archived',
              updated_by = $3::uuid,
              updated_at = now()
          where id = $1::uuid
            and organization_id = $2::uuid
            and deleted_at is null
          returning id, name, status
        `,
        [id, context.organizationId, context.user.id],
      );

      if (!deleted.rows[0]) {
        await client.query('rollback');
        return NextResponse.json(
          { ok: false, error: 'NOT_FOUND' },
          { status: 404 },
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
            old_values,
            new_values
          )
          values(
            $1::uuid,
            $2::uuid,
            'design_template.delete',
            'design_template',
            $3::uuid,
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          context.organizationId,
          context.user.id,
          id,
          JSON.stringify({ name: deleted.rows[0].name, status: 'active' }),
          JSON.stringify({ status: 'archived', deleted_at: true }),
        ],
      );

      await client.query('commit');
      return NextResponse.json({ ok: true });
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
