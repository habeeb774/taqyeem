import { NextRequest, NextResponse } from 'next/server';

import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';

function readPagination(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1));
  const limit = Math.min(
    48,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 12)),
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'generated_designs.view');

    const { page, limit, offset } = readPagination(req);
    const result = await pool.query(
      `
        select
          g.*,
          t.name template_name,
          u.name generated_by_name,
          e.full_name employee_name,
          count(*) over()::int total_count
        from public.generated_designs g
        join public.design_templates t on t.id = g.template_id
        join public.users u on u.id = g.generated_by
        left join public.employees e on e.id = g.employee_id
        where g.organization_id = $1::uuid
        order by g.created_at desc
        limit $2
        offset $3
      `,
      [context.organizationId, limit, offset],
    );

    return NextResponse.json({
      ok: true,
      designs: result.rows,
      page,
      limit,
      total: Number(result.rows[0]?.total_count || 0),
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
