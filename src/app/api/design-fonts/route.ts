import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';

const safeText = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[<>]/.test(value));

const fontInput = z.object({
  name: safeText,
  family: safeText,
  source: z.enum(['system', 'google', 'custom']).default('system'),
  url: z
    .string()
    .url()
    .max(1000)
    .refine((value) => value.startsWith('https://'), 'HTTPS_REQUIRED')
    .nullable()
    .optional(),
  is_default: z.boolean().default(false),
});

export async function GET() {
  try {
    const context = await requireUser();
    must(context, 'design_templates.view');

    const result = await pool.query(
      `
        select id, name, family, source, url, is_default, is_active
        from public.design_fonts
        where organization_id = $1::uuid
          and is_active = true
        order by is_default desc, name
      `,
      [context.organizationId],
    );

    return NextResponse.json({ ok: true, fonts: result.rows });
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
    must(context, 'design_templates.manage_fonts');

    const payload = fontInput.parse(await req.json());
    const client = await pool.connect();

    try {
      await client.query('begin');

      if (payload.is_default) {
        await client.query(
          `
            update public.design_fonts
            set is_default = false,
                updated_at = now()
            where organization_id = $1::uuid
          `,
          [context.organizationId],
        );
      }

      const result = await client.query(
        `
          insert into public.design_fonts(
            organization_id,
            name,
            family,
            source,
            url,
            is_default
          )
          values($1::uuid, $2, $3, $4, $5, $6)
          returning *
        `,
        [
          context.organizationId,
          payload.name,
          payload.family,
          payload.source,
          payload.url || null,
          payload.is_default,
        ],
      );

      await client.query('commit');
      return NextResponse.json(
        { ok: true, font: result.rows[0] },
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
