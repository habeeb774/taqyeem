import { z } from 'zod';
import { NextResponse } from 'next/server';

import { pool } from '@/db';
import {
  assertEmployeeAccess,
  jsonError,
  must,
  requireUser,
} from '@/server/context';

const generatedData = z
  .record(z.union([z.string().max(4000), z.number(), z.boolean(), z.null()]))
  .superRefine((value, context) => {
    if (Object.keys(value).length > 200) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TOO_MANY_FIELDS',
      });
    }
  });

const generateInput = z.object({
  template_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable().optional(),
  generated_data: generatedData,
  image_url: z
    .string()
    .regex(/^\/api\/design-assets\/[a-zA-Z0-9%/_.-]+$/)
    .max(1000),
  image_storage_key: z
    .string()
    .regex(/^organizations\/[a-f0-9-]+\/designs\/generated\/[a-zA-Z0-9_.-]+$/)
    .max(500),
  image_format: z.enum(['png', 'jpg', 'jpeg']),
  width: z.number().int().min(100).max(12000),
  height: z.number().int().min(100).max(12000),
});

function expectedAssetUrl(storageKey: string) {
  return `/api/design-assets/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
}

export async function POST(req: Request) {
  try {
    const context = await requireUser();
    must(context, 'design_templates.use');
    must(context, 'design_templates.export');

    const payload = generateInput.parse(await req.json());
    if (payload.employee_id) {
      await assertEmployeeAccess(context, payload.employee_id);
    }

    const client = await pool.connect();
    try {
      await client.query('begin');

      const template = await client.query(
        `
          select id, width, height
          from public.design_templates
          where id = $1::uuid
            and organization_id = $2::uuid
            and status = 'published'
            and deleted_at is null
          for update
        `,
        [payload.template_id, context.organizationId],
      );

      if (!template.rows[0]) {
        throw Object.assign(new Error('TEMPLATE_NOT_PUBLISHED'), { status: 409 });
      }

      if (
        Number(template.rows[0].width) !== payload.width ||
        Number(template.rows[0].height) !== payload.height
      ) {
        throw Object.assign(new Error('IMAGE_SIZE_MISMATCH'), { status: 400 });
      }

      const expectedPrefix = `organizations/${context.organizationId}/designs/generated/`;
      if (!payload.image_storage_key.startsWith(expectedPrefix)) {
        throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      }

      if (payload.image_url !== expectedAssetUrl(payload.image_storage_key)) {
        throw Object.assign(new Error('INVALID_IMAGE_REFERENCE'), { status: 400 });
      }

      const result = await client.query(
        `
          insert into public.generated_designs(
            organization_id,
            template_id,
            generated_by,
            employee_id,
            generated_data,
            image_url,
            image_storage_key,
            image_format,
            width,
            height
          )
          values(
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5::jsonb,
            $6,
            $7,
            $8,
            $9,
            $10
          )
          returning *
        `,
        [
          context.organizationId,
          payload.template_id,
          context.user.id,
          payload.employee_id || null,
          JSON.stringify(payload.generated_data),
          payload.image_url,
          payload.image_storage_key,
          payload.image_format,
          payload.width,
          payload.height,
        ],
      );

      await client.query(
        `
          update public.design_templates
          set usage_count = usage_count + 1
          where id = $1::uuid
        `,
        [payload.template_id],
      );

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
            'generated_design.create',
            'generated_design',
            $3::uuid,
            $4::jsonb
          )
        `,
        [
          context.organizationId,
          context.user.id,
          result.rows[0].id,
          JSON.stringify({
            template_id: payload.template_id,
            image_format: payload.image_format,
          }),
        ],
      );

      await client.query('commit');
      return NextResponse.json(
        { ok: true, design: result.rows[0] },
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
