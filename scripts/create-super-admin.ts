import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { Client } from '@neondatabase/serverless';

async function main() {

  const connectionString = process.env.TAQYEEM_DATABASE_URL||process.env.DATABASE_URL;
  const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || '';
  const name = (process.env.SUPER_ADMIN_NAME || 'مدير النظام').trim();
  if (!connectionString) throw new Error('DATABASE_URL is required');
  if (!email || !email.includes('@')) throw new Error('SUPER_ADMIN_EMAIL is required');
  if (password.length < 8) throw new Error('SUPER_ADMIN_PASSWORD must contain at least 8 characters');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('begin');
    const org = await client.query(`select id from public.organizations where active=true order by created_at limit 1`);
    if (!org.rows[0]) throw new Error('No active organization found');
    const role = await client.query(`select id from public.roles where code='super_admin' and active=true order by organization_id nulls first limit 1`);
    if (!role.rows[0]) throw new Error('super_admin role not found');

    const existing = await client.query(`select id from public.users where lower(email)=lower($1) limit 1`, [email]);
    const userId = existing.rows[0]?.id ? String(existing.rows[0].id) : randomUUID();
    const passwordHash = await hash(password, 12);
    const orgId = String(org.rows[0].id);
    const roleId = String(role.rows[0].id);
    await client.query(
      `insert into public.users(id,name,email,password_hash,organization_id,active)
       values($1::uuid,$2,$3,$4,$5::uuid,true)
       on conflict(id) do update set name=excluded.name,email=excluded.email,password_hash=excluded.password_hash,organization_id=excluded.organization_id,active=true,updated_at=now()`,
      [userId, name, email, passwordHash, orgId],
    );
    await client.query(
      `insert into public.profiles(id,organization_id,full_name,email,is_active)
       values($1::uuid,$2::uuid,$3,$4,true)
       on conflict(id) do update set organization_id=excluded.organization_id,full_name=excluded.full_name,email=excluded.email,is_active=true,updated_at=now()`,
      [userId, orgId, name, email],
    );
    const userRole = await client.query(
      `insert into public.user_roles(user_id,role_id,organization_id,created_by)
       values($1::uuid,$2::uuid,$3::uuid,$1::uuid)
       on conflict(user_id,role_id,organization_id) do update set role_id=excluded.role_id returning id`,
      [userId, roleId, orgId],
    );
    await client.query(
      `insert into public.role_scopes(user_role_id,scope_type,scope_id) values($1::uuid,'organization',null)
       on conflict do nothing`,
      [userRole.rows[0].id],
    );
    await client.query(
      `insert into public.user_scopes(user_id,organization_id,scope_type,scope_id,created_by) values($1::uuid,$2::uuid,'organization',null,$1::uuid) on conflict do nothing`,
      [userId, orgId],
    );
    await client.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
       values($1::uuid,$2::uuid,'system.super_admin_upsert','user',$2::uuid,$3::jsonb)`,
      [orgId, userId, JSON.stringify({ email, name, auth: 'Auth.js' })],
    );
    await client.query('commit');
    console.log(`Super Admin ready: ${email}`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

