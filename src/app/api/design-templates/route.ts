import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/db';
import { can, jsonError, must, requireUser } from '@/server/context';
import { slugify, templateInput } from '@/server/designs';

export const dynamic = 'force-dynamic';

const templateOrder = {
  newest: 't.updated_at desc',
  oldest: 't.updated_at asc',
  name: 't.name asc',
  usage: 't.usage_count desc',
} as const;

function selectedOrder(value: string | null) {
  return templateOrder[value as keyof typeof templateOrder] || templateOrder.newest;
}

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.view');

    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get('page') || 1));
    const limit = Math.min(48, Math.max(1, Number(params.get('limit') || 12)));
    const offset = (page - 1) * limit;
    const search = (params.get('q') || '').trim();
    const category = params.get('category') || '';
    const status = params.get('status') || '';
    const createdBy = params.get('created_by') || '';
    const order = selectedOrder(params.get('sort'));
    const canManageTemplates =
      can(context, 'design_templates.edit') ||
      can(context, 'design_templates.publish') ||
      can(context, 'design_templates.create');

    const templates = await pool.query(
      `select
         t.*,
         c.name category_name,
         u.name created_by_name,
         count(*) over()::int total_count
       from public.design_templates t
       left join public.design_categories c on c.id = t.category_id
       left join public.users u on u.id = t.created_by
       where t.organization_id = $1::uuid
         and t.deleted_at is null
         and (
           $2 = ''
           or t.name ilike '%' || $2 || '%'
           or coalesce(t.description, '') ilike '%' || $2 || '%'
         )
         and ($3 = '' or t.category_id::text = $3)
         and ($4 = '' or t.status = $4)
         and ($5 = '' or t.created_by::text = $5)
         and ($6::boolean or t.status = 'published')
       order by ${order}
       limit $7 offset $8`,
      [
        context.organizationId,
        search,
        category,
        status,
        createdBy,
        canManageTemplates,
        limit,
        offset,
      ],
    );

    const creators = await pool.query(
      `select distinct u.id, u.name
       from public.design_templates t
       join public.users u on u.id = t.created_by
       where t.organization_id = $1::uuid
         and t.deleted_at is null
         and ($2::boolean or t.status = 'published')
       order by u.name`,
      [context.organizationId, canManageTemplates],
    );

    return NextResponse.json({
      ok: true,
      templates: templates.rows,
      creators: creators.rows,
      page,
      limit,
      total: Number(templates.rows[0]?.total_count || 0),
    });
  } catch (error) {
    const payload = jsonError(error);
    return NextResponse.json({ ok: false, error: payload.error }, { status: payload.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.create');

    const input = templateInput.parse(await req.json());

    if (input.category_id) {
      const category = await pool.query(
        `select 1
         from public.design_categories
         where id = $1::uuid
           and organization_id = $2::uuid
           and is_active = true`,
        [input.category_id, context.organizationId],
      );

      if (!category.rows[0]) {
        throw Object.assign(new Error('INVALID_CATEGORY'), { status: 400 });
      }
    }

    const slug = `${input.slug || slugify(input.name)}-${Date.now().toString(36)}`;
    const created = await pool.query(
      `insert into public.design_templates(
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
       ) values (
         $1::uuid,
         $2,
         $3,
         $4,
         $5::uuid,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11,
         $12,
         $13,
         $14::uuid,
         $14::uuid
       )
       returning *`,
      [
        context.organizationId,
        input.name,
        slug,
        input.description || null,
        input.category_id || null,
        input.background_image_url || null,
        input.background_storage_key || null,
        input.thumbnail_url || input.background_image_url || null,
        input.thumbnail_storage_key || input.background_storage_key || null,
        input.width,
        input.height,
        input.status,
        input.notes || null,
        context.user.id,
      ],
    );

    await pool.query(
      `insert into public.audit_logs(
         organization_id,
         user_id,
         action,
         entity_type,
         entity_id,
         new_values
       ) values (
         $1::uuid,
         $2::uuid,
         'design_template.create',
         'design_template',
         $3::uuid,
         $4::jsonb
       )`,
      [
        context.organizationId,
        context.user.id,
        created.rows[0].id,
        JSON.stringify({ name: input.name, status: input.status }),
      ],
    );

    return NextResponse.json({ ok: true, template: created.rows[0] }, { status: 201 });
  } catch (error) {
    const payload = jsonError(error);
    return NextResponse.json({ ok: false, error: payload.error }, { status: payload.status });
  }
}
