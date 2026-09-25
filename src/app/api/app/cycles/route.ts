import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, must, requireUser } from '@/server/context';
import { pool } from '@/db';
import { allVisibleEmployees } from '@/db/queries/security';
import { resolveTemplatesBatch } from '@/db/queries/evaluations';
import { withNeonTransaction } from '@/lib/neon/admin';

type CycleRow = {
  id: string;
  name: string;
  month: number;
  year: number;
  status: string;
  starts_at: string;
  ends_at: string;
  opened_at: string | null;
  published_at: string | null;
  locked_at: string | null;
};

type IdRow = { id: string };
type VisibleEmployee = { id: string };

const schema = z.object({
  name: z.string().min(2),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2200),
  starts_at: z.string(),
  ends_at: z.string(),
});

function hasOrganizationScope(c: Awaited<ReturnType<typeof requireUser>>) {
  return c.scopes.some((scope) => scope.type === 'organization');
}

export async function GET() {
  try {
    const c = await requireUser();
    const q = await pool.query<CycleRow>(
      `select
         id,name,month,year,status,starts_at,ends_at,opened_at,published_at,locked_at
       from public.evaluation_cycles
       where organization_id=$1::uuid
       order by year desc,month desc`,
      [c.organizationId],
    );
    return NextResponse.json({ ok: true, cycles: q.rows });
  } catch (e) {
    const x = jsonError(e);
    return NextResponse.json(
      { ok: false, error: x.error },
      { status: x.status },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await requireUser();
    must(c, 'evaluations.create');
    const b = await req.json();

    if (b?.action === 'open') {
      const id = z.string().uuid().parse(b.id);
      if (!hasOrganizationScope(c)) {
        throw Object.assign(new Error('organization_scope_required'), {
          status: 403,
        });
      }

      const em: VisibleEmployee[] = await allVisibleEmployees(c);
      let made = 0;
      await withNeonTransaction(async (tx) => {
        const cycle = await tx.query<IdRow>(
          `select id
           from public.evaluation_cycles
           where id=$1::uuid and organization_id=$2::uuid
           for update`,
          [id, c.organizationId],
        );
        if (!cycle.rows[0]) throw new Error('cycle_not_found');

        await tx.query(
          `update public.evaluation_cycles
           set status=case when status='draft' then 'open' else status end,
               opened_at=coalesce(opened_at,now()),
               updated_at=now()
           where id=$1::uuid and organization_id=$2::uuid`,
          [id, c.organizationId],
        );

        // Batched instead of one exclusion-check + one template-resolve + one
        // insert per employee: for an org with N employees this collapsed
        // ~3N sequential round-trips into 3 total.
        const employeeIds = em.map((employee) => String(employee.id));
        const excludedResult = await tx.query(
          `select employee_id from public.evaluation_exclusions where cycle_id=$1::uuid and employee_id = any($2::uuid[])`,
          [id, employeeIds],
        );
        const excludedIds = new Set((excludedResult.rows as any[]).map((row) => String(row.employee_id)));

        const candidateIds = employeeIds.filter((employeeId) => !excludedIds.has(employeeId));
        const templateByEmployee = await resolveTemplatesBatch(tx, c.organizationId, candidateIds);
        const toInsert = candidateIds
          .map((employeeId) => ({ employeeId, templateId: templateByEmployee.get(employeeId) }))
          .filter((row): row is { employeeId: string; templateId: string } => Boolean(row.templateId));

        if (toInsert.length) {
          const params: unknown[] = [id, c.user.id];
          const valueRows = toInsert.map((row) => {
            const beforeLength = params.length;
            params.push(row.employeeId, row.templateId);
            return `($1::uuid, $${beforeLength + 1}::uuid, $2::uuid, $${beforeLength + 2}::uuid, 'performance', $2::uuid)`;
          });
          const inserted = await tx.query(
            `insert into public.evaluation_assignments(cycle_id,employee_id,evaluator_user_id,template_id,evaluation_type,created_by)
             values ${valueRows.join(',')}
             on conflict(cycle_id,employee_id,evaluator_user_id,evaluation_type) do nothing
             returning id`,
            params,
          );
          made += (inserted as any).rowCount ?? inserted.rows.length;
        }

        await tx.query(
          `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
           values($1::uuid,$2::uuid,'cycle.open','evaluation_cycle',$3::uuid,$4::jsonb)`,
          [
            c.organizationId,
            c.user.id,
            id,
            JSON.stringify({ assignments_created: made }),
          ],
        );
      });
      return NextResponse.json({ ok: true, assignments_created: made });
    }

    const p = schema.parse(b);
    const existing = await pool.query<CycleRow>(
      `select *
       from public.evaluation_cycles
       where organization_id=$1::uuid and month=$2 and year=$3
       limit 1`,
      [c.organizationId, p.month, p.year],
    );
    if (existing.rows[0]) {
      return NextResponse.json({
        ok: true,
        cycle: existing.rows[0],
        existing: true,
      });
    }
    const q = await pool.query<CycleRow>(
      `insert into public.evaluation_cycles(organization_id,name,month,year,starts_at,ends_at,status,created_by)
       values($1::uuid,$2,$3,$4,$5::date,$6::date,'draft',$7::uuid)
       returning *`,
      [
        c.organizationId,
        p.name,
        p.month,
        p.year,
        p.starts_at,
        p.ends_at,
        c.user.id,
      ],
    );
    return NextResponse.json({ ok: true, cycle: q.rows[0] });
  } catch (e) {
    const x = jsonError(e);
    return NextResponse.json(
      { ok: false, error: x.error },
      { status: x.status },
    );
  }
}
