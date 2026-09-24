import { pool } from '@/db';
import { jsonFail, jsonOk } from '@/server/api';
import { must, requireUser } from '@/server/context';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const context = await requireUser();
    must(context, 'recruitment.jobs.view');

    const [departments, branches] = await Promise.all([
      pool.query(
        `select id, name from public.departments where organization_id=$1::uuid and active=true and deleted_at is null order by name`,
        [context.organizationId],
      ),
      pool.query(
        `select id, name, city from public.branches where organization_id=$1::uuid and active=true and deleted_at is null order by name`,
        [context.organizationId],
      ),
    ]);

    return jsonOk({ departments: departments.rows, branches: branches.rows });
  } catch (error) {
    return jsonFail(error);
  }
}
