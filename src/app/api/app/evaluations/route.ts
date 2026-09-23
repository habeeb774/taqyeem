import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireUser,
  jsonError,
  must,
  assertEmployeeAccess,
  can,
} from "@/server/context";
import { pool } from "@/db";
import { allVisibleEmployeeIds } from "@/db/queries/security";
import {
  resolveTemplate,
  templateItems,
  recomputeEvaluation,
} from "@/db/queries/evaluations";
import { withNeonTransaction } from "@/lib/neon/admin";

const answerSchema = z.object({
  criterion_id: z.string().uuid(),
  score: z.number().positive(),
  comment: z.string().optional().default(""),
});

const editableCycleStatuses = new Set(["open", "in_progress"]);

async function assertCycleEditable(cycleId: string, organizationId: string) {
  const cyc = await pool.query(
    `select id,status from public.evaluation_cycles where id=$1::uuid and organization_id=$2::uuid`,
    [cycleId, organizationId],
  );
  const cycle = cyc.rows[0] as any;
  if (!cycle) throw new Error("cycle_not_found");
  if (!editableCycleStatuses.has(String(cycle.status))) {
    throw Object.assign(new Error("cycle_not_open"), { status: 409 });
  }
  return cycle;
}

async function loadAnswerMeta(
  queryable: { query: Function },
  templateId: string,
  criterionId: string,
) {
  const meta = await queryable.query(
    `select c.id,c.name,c.description,c.max_score,tc.weight,tc.comment_required
     from public.template_criteria tc
     join public.evaluation_criteria c on c.id=tc.criterion_id
     where tc.template_id=$1::uuid and c.id=$2::uuid`,
    [templateId, criterionId],
  );
  const row = meta.rows[0] as any;
  if (!row) throw new Error("INVALID_CRITERION");
  return row;
}

function assertScoreWithinMax(score: number, maxScore: unknown) {
  if (score > Number(maxScore)) {
    throw Object.assign(new Error("score_exceeds_max"), { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const c = await requireUser();
    must(c, "evaluations.view");
    const u = new URL(req.url);
    const evaluationId = u.searchParams.get("evaluation_id");
    const employeeId = u.searchParams.get("employee_id");
    const cycleId = u.searchParams.get("cycle_id");
    const queue = u.searchParams.get("queue");

    if (evaluationId) {
      const ev = await pool.query(
        `select e.*,emp.full_name,emp.employee_number,j.name job_title_name,c.name cycle_name,c.month,c.year
         from public.evaluations e
         join public.employees emp on emp.id=e.employee_id
         left join public.job_titles j on j.id=emp.job_title_id
         join public.evaluation_cycles c on c.id=e.cycle_id
         where e.id=$1::uuid`,
        [evaluationId],
      );
      if (!ev.rows[0])
        throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
      await assertEmployeeAccess(c, String((ev.rows[0] as any).employee_id));
      if (
        String((ev.rows[0] as any).evaluator_user_id) !== c.user.id &&
        !can(c, "evaluations.review") &&
        !can(c, "evaluations.approve")
      ) {
        throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
      }
      const ans = await pool.query(
        `select * from public.evaluation_answers where evaluation_id=$1::uuid order by created_at`,
        [evaluationId],
      );
      const x: any = ev.rows[0];
      x.employees = {
        full_name: x.full_name,
        employee_number: x.employee_number,
        job_titles: x.job_title_name ? { name: x.job_title_name } : null,
      };
      x.evaluation_cycles = {
        name: x.cycle_name,
        month: x.month,
        year: x.year,
      };
      return NextResponse.json({ ok: true, evaluation: x, answers: ans.rows });
    }

    if (queue === "review") {
      if (
        !can(c, "evaluations.review") &&
        !can(c, "evaluations.approve") &&
        !can(c, "evaluations.publish")
      ) {
        throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
      }
      const ids = await allVisibleEmployeeIds(c);
      if (!ids.length) return NextResponse.json({ ok: true, evaluations: [] });
      const r = await pool.query(
        `select
           e.id,
           e.cycle_id,
           e.employee_id,
           e.evaluator_user_id,
           e.status,
           e.weighted_score,
           e.final_score,
           e.result_label,
           e.notes,
           e.submitted_at,
           e.reviewed_at,
           e.approved_at,
           e.published_at,
           emp.full_name,
           emp.employee_number,
           j.name job_title_name,
           c.name cycle_name,
           c.month,
           c.year
         from public.evaluations e
         join public.employees emp on emp.id=e.employee_id
         left join public.job_titles j on j.id=emp.job_title_id
         join public.evaluation_cycles c on c.id=e.cycle_id
         where e.employee_id=any($1::uuid[]) and e.status::text=any($2::text[]) and ($3::uuid is null or e.cycle_id=$3::uuid)
         order by e.submitted_at desc nulls last limit 200`,
        [
          ids,
          ["submitted", "reviewed", "approved", "published", "locked"],
          cycleId || null,
        ],
      );
      return NextResponse.json({
        ok: true,
        evaluations: r.rows.map((x: any) => ({
          ...x,
          employees: {
            full_name: x.full_name,
            employee_number: x.employee_number,
            job_titles: x.job_title_name ? { name: x.job_title_name } : null,
          },
          evaluation_cycles: {
            name: x.cycle_name,
            month: x.month,
            year: x.year,
          },
        })),
      });
    }

    const params: any[] = [c.user.id];
    let where = `evaluator_user_id=$1::uuid`;
    if (employeeId) {
      await assertEmployeeAccess(c, employeeId);
      params.push(employeeId);
      where += ` and employee_id=$${params.length}::uuid`;
    } else {
      const visibleIds = await allVisibleEmployeeIds(c);
      if (!visibleIds.length)
        return NextResponse.json({ ok: true, assignments: [] });
      params.push(visibleIds);
      where += ` and employee_id=any($${params.length}::uuid[])`;
    }
    if (cycleId) {
      params.push(cycleId);
      where += ` and cycle_id=$${params.length}::uuid`;
    }
    const r = await pool.query(
      `select id,cycle_id,employee_id,evaluation_type,template_id,due_at from public.evaluation_assignments where ${where}`,
      params,
    );
    return NextResponse.json({ ok: true, assignments: r.rows });
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
    const b = await req.json();
    const action = String(b?.action || "");

    if (action === "ensure") {
      must(c, "evaluations.edit");
      const employeeId = z.string().uuid().parse(b.employee_id);
      const cycleId = z.string().uuid().parse(b.cycle_id);
      await assertEmployeeAccess(c, employeeId);
      await assertCycleEditable(cycleId, c.organizationId);

      const templateId = await resolveTemplate(c.organizationId, employeeId);
      if (!templateId) throw new Error("TEMPLATE_NOT_FOUND");
      const items = await templateItems(templateId);
      let evaluationId = "";
      await withNeonTransaction(async (tx) => {
        let a = await tx.query(
          `select id from public.evaluation_assignments where cycle_id=$1::uuid and employee_id=$2::uuid and evaluator_user_id=$3::uuid and evaluation_type='performance' limit 1`,
          [cycleId, employeeId, c.user.id],
        );
        if (!a.rows[0]) {
          a = await tx.query(
            `insert into public.evaluation_assignments(cycle_id,employee_id,evaluator_user_id,template_id,evaluation_type,created_by)
             values($1::uuid,$2::uuid,$3::uuid,$4::uuid,'performance',$3::uuid) returning id`,
            [cycleId, employeeId, c.user.id, templateId],
          );
        }
        const assignmentId = String(a.rows[0].id);
        let e = await tx.query(
          `select id from public.evaluations where assignment_id=$1::uuid limit 1`,
          [assignmentId],
        );
        if (!e.rows[0]) {
          e = await tx.query(
            `insert into public.evaluations(assignment_id,cycle_id,employee_id,evaluator_user_id,evaluation_type,template_id,template_snapshot,status)
             values($1::uuid,$2::uuid,$3::uuid,$4::uuid,'performance',$5::uuid,$6::jsonb,'draft') returning id`,
            [
              assignmentId,
              cycleId,
              employeeId,
              c.user.id,
              templateId,
              JSON.stringify({ template_id: templateId, criteria: items }),
            ],
          );
        }
        evaluationId = String(e.rows[0].id);
      });
      return NextResponse.json({ ok: true, evaluation_id: evaluationId });
    }

    if (action === "autosave") {
      must(c, "evaluations.edit");
      const p = z
        .object({
          evaluation_id: z.string().uuid(),
          answer: answerSchema.optional(),
          notes: z.string().optional(),
        })
        .parse(b);
      const ev = await pool.query(
        `select id,employee_id,evaluator_user_id,status,template_id from public.evaluations where id=$1::uuid`,
        [p.evaluation_id],
      );
      const e: any = ev.rows[0];
      if (!e) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
      await assertEmployeeAccess(c, String(e.employee_id));
      if (String(e.evaluator_user_id) !== c.user.id || e.status !== "draft") {
        throw Object.assign(new Error("evaluation_not_editable"), {
          status: 409,
        });
      }
      if (p.answer) {
        const m = await loadAnswerMeta(
          pool,
          e.template_id,
          p.answer.criterion_id,
        );
        assertScoreWithinMax(p.answer.score, m.max_score);
        await pool.query(
          `insert into public.evaluation_answers(evaluation_id,criterion_id,criterion_name_snapshot,criterion_description_snapshot,weight_snapshot,max_score_snapshot,score,comment)
           values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8)
           on conflict(evaluation_id,criterion_id) do update set score=excluded.score,comment=excluded.comment,updated_at=now()`,
          [
            p.evaluation_id,
            p.answer.criterion_id,
            m.name,
            m.description,
            Number(m.weight),
            Number(m.max_score),
            p.answer.score,
            p.answer.comment || "",
          ],
        );
      }
      if (p.notes !== undefined) {
        await pool.query(
          `update public.evaluations set notes=$2,updated_at=now() where id=$1::uuid`,
          [p.evaluation_id, p.notes],
        );
      }
      const score = await recomputeEvaluation(p.evaluation_id);
      return NextResponse.json({ ok: true, score });
    }

    if (action === "save") {
      must(c, "evaluations.edit");
      const p = z
        .object({
          evaluation_id: z.string().uuid(),
          notes: z.string().default(""),
          answers: z.array(answerSchema),
        })
        .parse(b);
      const ev = await pool.query(
        `select employee_id,evaluator_user_id,status,template_id from public.evaluations where id=$1::uuid`,
        [p.evaluation_id],
      );
      const e: any = ev.rows[0];
      if (!e) throw new Error("NOT_FOUND");
      await assertEmployeeAccess(c, String(e.employee_id));
      if (String(e.evaluator_user_id) !== c.user.id || e.status !== "draft") {
        throw Object.assign(new Error("evaluation_not_editable"), {
          status: 409,
        });
      }
      await withNeonTransaction(async (tx) => {
        for (const a of p.answers) {
          const m = await loadAnswerMeta(tx, e.template_id, a.criterion_id);
          assertScoreWithinMax(a.score, m.max_score);
          await tx.query(
            `insert into public.evaluation_answers(evaluation_id,criterion_id,criterion_name_snapshot,criterion_description_snapshot,weight_snapshot,max_score_snapshot,score,comment)
             values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8)
             on conflict(evaluation_id,criterion_id) do update set score=excluded.score,comment=excluded.comment,updated_at=now()`,
            [
              p.evaluation_id,
              a.criterion_id,
              m.name,
              m.description,
              Number(m.weight),
              Number(m.max_score),
              a.score,
              a.comment || "",
            ],
          );
        }
        await tx.query(
          `update public.evaluations set notes=$2,updated_at=now() where id=$1::uuid`,
          [p.evaluation_id, p.notes],
        );
      });
      return NextResponse.json({
        ok: true,
        score: await recomputeEvaluation(p.evaluation_id),
      });
    }

    if (
      [
        "submitted",
        "reviewed",
        "approved",
        "published",
        "locked",
        "draft",
      ].includes(action)
    ) {
      const id = z.string().uuid().parse(b.evaluation_id);
      const ev = await pool.query(
        `select * from public.evaluations where id=$1::uuid`,
        [id],
      );
      const e: any = ev.rows[0];
      if (!e) throw new Error("NOT_FOUND");
      await assertEmployeeAccess(c, String(e.employee_id));
      const perm: any = {
        submitted: "evaluations.submit",
        reviewed: "evaluations.review",
        approved: "evaluations.approve",
        published: "evaluations.publish",
        locked: "evaluations.approve",
        draft: "evaluations.reopen",
      };
      must(c, perm[action]);
      const allowed: any = {
        submitted: ["draft"],
        reviewed: ["submitted"],
        approved: ["reviewed"],
        published: ["approved"],
        locked: ["published"],
        draft: ["submitted", "reviewed", "approved", "published", "locked"],
      };
      if (!allowed[action].includes(e.status))
        throw Object.assign(new Error("invalid_transition"), { status: 409 });
      if (action === "submitted") {
        const chk = await pool.query(
          `select count(*) filter(where tc.mandatory)::int required,
                  count(a.id) filter(where tc.mandatory)::int answered,
                  count(*) filter(where tc.comment_required and coalesce(trim(a.comment),'')='')::int missing_comment
           from public.template_criteria tc
           left join public.evaluation_answers a on a.evaluation_id=$1::uuid and a.criterion_id=tc.criterion_id
           where tc.template_id=$2::uuid`,
          [id, e.template_id],
        );
        const zc: any = chk.rows[0];
        if (Number(zc.answered) < Number(zc.required))
          throw new Error("evaluation_incomplete");
        if (Number(zc.missing_comment) > 0)
          throw new Error("required_comment_missing");
      }
      const col: any = {
        submitted: "submitted_at",
        reviewed: "reviewed_at",
        approved: "approved_at",
        published: "published_at",
        locked: "locked_at",
        draft: "reopened_at",
      };
      const reasonText = String(b.reason || "").trim();
      const reason = action === "draft" ? reasonText : null;
      if (action === "draft" && reasonText.length < 3)
        throw new Error("REOPEN_REASON_REQUIRED");
      await withNeonTransaction(async (tx) => {
        await tx.query(
          `update public.evaluations set status=$2::evaluation_status,${col[action]}=now(),reopen_reason=case when $2='draft' then $3 else reopen_reason end,updated_at=now(),version=version+1 where id=$1::uuid`,
          [id, action, reason],
        );
        await tx.query(
          `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values,reason)
           values($1::uuid,$2::uuid,$3,'evaluation',$4::uuid,$5::jsonb,$6::jsonb,$7)`,
          [
            c.organizationId,
            c.user.id,
            `evaluation.${action}`,
            id,
            JSON.stringify({ status: e.status }),
            JSON.stringify({ status: action }),
            reason,
          ],
        );
      });
      return NextResponse.json({ ok: true, status: action });
    }

    throw new Error("INVALID_ACTION");
  } catch (e) {
    const x = jsonError(e);
    return NextResponse.json(
      { ok: false, error: x.error },
      { status: x.status },
    );
  }
}
