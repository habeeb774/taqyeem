import { hash } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { withNeonTransaction } from '@/lib/neon/admin';

const setupSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

async function setupAlreadyCompleted() {
  const result = await pool.query(
    `
      select count(*)::int count
      from public.users
      where active = true
        and organization_id is not null
        and password_hash is not null
    `,
  );

  return Number((result.rows[0] as any)?.count || 0) > 0;
}

async function getSetupDependencies() {
  const [organization, role] = await Promise.all([
    pool.query(
      `
        select id
        from public.organizations
        where active = true
        order by created_at
        limit 1
      `,
    ),
    pool.query(
      `
        select id
        from public.roles
        where code = 'super_admin'
          and active = true
        order by organization_id nulls first
        limit 1
      `,
    ),
  ]);

  if (!organization.rows[0] || !role.rows[0]) {
    throw new Error('ORGANIZATION_NOT_FOUND');
  }

  return {
    organizationId: String((organization.rows[0] as any).id),
    roleId: String((role.rows[0] as any).id),
  };
}

export async function POST(req: NextRequest) {
  const parsed = setupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'INVALID_INPUT' },
      { status: 400 },
    );
  }

  try {
    if (await setupAlreadyCompleted()) {
      return NextResponse.json(
        { ok: false, error: 'SETUP_ALREADY_COMPLETED' },
        { status: 409 },
      );
    }

    const userId = crypto.randomUUID();
    const email = parsed.data.email.toLowerCase();
    const passwordHash = await hash(parsed.data.password, 12);
    const { organizationId, roleId } = await getSetupDependencies();

    await withNeonTransaction(async (tx) => {
      await tx.query(
        `
          insert into public.users(
            id,
            name,
            email,
            password_hash,
            organization_id,
            active
          )
          values($1::uuid, $2, $3, $4, $5::uuid, true)
        `,
        [userId, parsed.data.full_name, email, passwordHash, organizationId],
      );

      await tx.query(
        `
          insert into public.profiles(
            id,
            organization_id,
            full_name,
            email,
            is_active
          )
          values($1::uuid, $2::uuid, $3, $4, true)
          on conflict(id) do update set
            organization_id = excluded.organization_id,
            full_name = excluded.full_name,
            email = excluded.email,
            is_active = true,
            updated_at = now()
        `,
        [userId, organizationId, parsed.data.full_name, email],
      );

      const userRole = await tx.query(
        `
          insert into public.user_roles(
            user_id,
            role_id,
            organization_id,
            created_by
          )
          values($1::uuid, $2::uuid, $3::uuid, $1::uuid)
          returning id
        `,
        [userId, roleId, organizationId],
      );

      await tx.query(
        `
          insert into public.role_scopes(user_role_id, scope_type, scope_id)
          values($1::uuid, 'organization', null)
          on conflict do nothing
        `,
        [userRole.rows[0].id],
      );

      await tx.query(
        `
          insert into public.user_scopes(
            user_id,
            organization_id,
            scope_type,
            scope_id,
            created_by
          )
          values($1::uuid, $2::uuid, 'organization', null, $1::uuid)
          on conflict do nothing
        `,
        [userId, organizationId],
      );

      await tx.query(
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
            'system.first_admin',
            'user',
            $2::uuid,
            $3::jsonb
          )
        `,
        [
          organizationId,
          userId,
          JSON.stringify({
            email,
            full_name: parsed.data.full_name,
            auth: 'Auth.js',
          }),
        ],
      );
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'SETUP_FAILED' },
      { status: 400 },
    );
  }
}
