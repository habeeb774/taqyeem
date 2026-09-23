import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';

type Context = Awaited<ReturnType<typeof requireUser>>;

async function readSourceTemplate(id: string, context: Context) {
  const source = await pool.query(
    `
      select *
      from public.design_templates
      where id = $1::uuid
        and organization_id = $2::uuid
        and deleted_at is null
      for share
    `,
    [id, context.organizationId],
  );

  return source.rows[0];
}

async function insertTemplateCopy(client: any, source: any, context: Context) {
  const copySlug = `${source.slug}-copy-${Date.now().toString(36)}`;

  return client.query(
    `
      insert into public.design_templates(
        organization_id,
        name,
        slug,
        description,
        category_id,
        background_image_url,
        background_storage_key,
        thumbnail_url,
        thumbnail_storage_key,
        width,
        height,
        status,
        notes,
        created_by,
        updated_by
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
        'draft',
        $12,
        $13::uuid,
        $13::uuid
      )
      returning *
    `,
    [
      context.organizationId,
      `${source.name} - نسخة`,
      copySlug,
      source.description,
      source.category_id,
      source.background_image_url,
      source.background_storage_key,
      source.thumbnail_url,
      source.thumbnail_storage_key,
      source.width,
      source.height,
      source.notes,
      context.user.id,
    ],
  );
}

async function copyTemplateFields(
  client: any,
  sourceTemplateId: string,
  copyTemplateId: string,
) {
  await client.query(
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
      select
        $2::uuid,
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
      from public.design_template_fields
      where template_id = $1::uuid
    `,
    [sourceTemplateId, copyTemplateId],
  );
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.create');

    const { id } = await params;
    z.string().uuid().parse(id);

    const client = await pool.connect();
    try {
      await client.query('begin');

      const source = await readSourceTemplate(id, context);
      if (!source) {
        throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      }

      const copy = await insertTemplateCopy(client, source, context);
      await copyTemplateFields(client, id, copy.rows[0].id);

      await client.query('commit');
      return NextResponse.json(
        { ok: true, template: copy.rows[0] },
        { status: 201 },
      );
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
