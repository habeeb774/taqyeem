import { z } from 'zod';
import type { SecurityContext } from '@/db/queries/security';
import { must } from '@/server/context';
import { withNeonTransaction } from '@/lib/neon/admin';

export async function reopenCycleEvaluations(context: SecurityContext, input: unknown) {
  if (!context.roles.some(role => role.code === 'super_admin')) {
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
  }
  must(context, 'evaluations.reopen');
  const { cycle_id, reason } = z.object({
    cycle_id: z.string().uuid(), reason: z.string().trim().min(3).max(1000),
  }).parse(input);
  return withNeonTransaction(async tx => {
    const cycle = await tx.query(
      'select id from public.evaluation_cycles where id=$1::uuid and organization_id=$2::uuid for update',
      [cycle_id, context.organizationId],
    );
    if (!cycle.rows.length) throw new Error('cycle_not_found');
    const previous = await tx.query(
      `select ev.id, ev.status from public.evaluations ev
       join public.employees emp on emp.id=ev.employee_id
       where ev.evaluation_cycle_id=$1::uuid and emp.organization_id=$2::uuid
       and ev.status in ('submitted','reviewed','approved','published','locked') for update of ev`,
      [cycle_id, context.organizationId],
    );
    for (const evaluation of previous.rows) {
      await tx.query(
        `update public.evaluations set status='draft',reopened_at=now(),reopen_reason=$2,
         updated_at=now(),version=version+1 where id=$1::uuid`, [evaluation.id, reason],
      );
      await tx.query(
        `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values,reason)
         values($1::uuid,$2::uuid,'evaluation.bulk_reopen','evaluation',$3::uuid,$4::jsonb,$5::jsonb,$6)`,
        [context.organizationId, context.user.id, evaluation.id,
          JSON.stringify({ status: evaluation.status }), JSON.stringify({ status: 'draft', cycle_id }), reason],
      );
    }
    return previous.rows.length;
  });
}
