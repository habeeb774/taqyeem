import { pool } from '@/db';

export async function resolveDefaultOrganizationId() {
  const result = await pool.query<{ id: string }>(
    `select id from public.organizations where active = true order by created_at limit 1`,
  );
  const id = result.rows[0]?.id;
  if (!id) throw Object.assign(new Error('ORGANIZATION_NOT_FOUND'), { status: 503 });
  return String(id);
}
