import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';
import { slugify } from '@/server/designs';

const categoryInput = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !/[<>]/.test(value)),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function GET() {
  try {
    const context = await requireUser();
    must(context, 'design_templates.view');

    const result = await pool.query(
      `
        select id, name, slug, description, is_active
        from public.design_categories
        where organization_id = $1::uuid
          and is_active = true
        order by name
      `,
      [context.organizationId],
    );

    return NextResponse.json({ ok: true, categories: result.rows });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

export async function POST(req: Request) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.manage_categories');

    const payload = categoryInput.parse(await req.json());
    const result = await pool.query(
      `
        insert into public.design_categories(
          organization_id,
          name,
          slug,
          description
        )
        values($1::uuid, $2, $3, $4)
        returning *
      `,
      [
        context.organizationId,
        payload.name,
        `${slugify(payload.name)}-${Date.now().toString(36)}`,
        payload.description || null,
      ],
    );

    return NextResponse.json(
      { ok: true, category: result.rows[0] },
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
