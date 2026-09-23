import { pool } from '@/db';

export async function resolveTemplate(organizationId: string, employeeId: string) {
  const result = await pool.query(
    `select t.id
     from public.employees e
     join lateral (
       select et.id
       from public.evaluation_templates et
       where et.organization_id = e.organization_id
         and et.active = true
         and (
           (et.scope_type = 'employee' and et.scope_id = e.id)
           or (et.scope_type = 'job_title' and et.scope_id = e.job_title_id)
           or (et.scope_type = 'department' and et.scope_id = e.department_id)
           or (et.scope_type = 'general' and et.scope_id is null)
         )
       order by
         case et.scope_type
           when 'employee' then 1
           when 'job_title' then 2
           when 'department' then 3
           else 4
         end,
         et.version desc
       limit 1
     ) t on true
     where e.id = $1::uuid
       and e.organization_id = $2::uuid
       and e.deleted_at is null`,
    [employeeId, organizationId],
  );

  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

export async function templateItems(templateId: string) {
  const result = await pool.query(
    `select
       c.id,
       c.code,
       c.name,
       c.description,
       c.max_score,
       tc.weight,
       tc.sort_order,
       tc.mandatory,
       tc.visible_to_employee,
       tc.comment_required
     from public.template_criteria tc
     join public.evaluation_criteria c on c.id = tc.criterion_id
     where tc.template_id = $1::uuid
       and c.active = true
     order by tc.sort_order`,
    [templateId],
  );

  return result.rows;
}

function scoreLabel(score: number | null) {
  if (score == null) return null;
  if (score >= 90) return 'ممتاز';
  if (score >= 80) return 'جيد جداً';
  if (score >= 70) return 'جيد';
  if (score >= 60) return 'مقبول';
  return 'يحتاج تحسين';
}

export async function recomputeEvaluation(evaluationId: string) {
  const result = await pool.query(
    `select
       case
         when sum(weight_snapshot) > 0 then
           round(
             sum((score / max_score_snapshot) * weight_snapshot) / sum(weight_snapshot) * 100,
             3
           )
         else null
       end score
     from public.evaluation_answers
     where evaluation_id = $1::uuid`,
    [evaluationId],
  );

  const rawScore = result.rows[0]?.score;
  const score = rawScore == null ? null : Number(rawScore);

  await pool.query(
    `update public.evaluations
     set weighted_score = $2,
         final_score = $2,
         result_label = $3,
         updated_at = now(),
         version = version + 1
     where id = $1::uuid`,
    [evaluationId, score, scoreLabel(score)],
  );

  return score;
}
