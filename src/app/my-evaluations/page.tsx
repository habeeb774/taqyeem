import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";

import { pool } from "@/db";
import { requireUser } from "@/server/context";
import { Badge, Button, PageHeader, Textarea } from "@/components/ui";

type AnswerRow = {
  evaluation_id: string;
  criterion_name_snapshot: string;
  criterion_description_snapshot: string | null;
  weight_snapshot: string;
  max_score_snapshot: string;
  score: string;
  comment: string | null;
};

type EvaluationRow = {
  id: string;
  status: string;
  weighted_score: string | null;
  final_score: string | null;
  result_label: string | null;
  notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  cycle_name: string;
  month: number;
  year: number;
  evaluator_user_id: string;
  evaluator_name: string | null;
  answers: AnswerRow[];
};

const visibleStatuses = ["reviewed", "approved", "published", "locked"];

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    reviewed: "تمت المراجعة",
    approved: "معتمد",
    published: "منشور",
    locked: "مقفل",
  };
  return labels[status] || status;
}

async function requestReview(formData: FormData) {
  "use server";
  const context = await requireUser();
  if (!context.user.employeeId) {
    throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  }

  const evaluationId = String(formData.get("evaluation_id") || "");
  const note = String(formData.get("review_note") || "").trim();
  if (note.length < 5) return;

  const result = await pool.query<{
    id: string;
    evaluator_user_id: string;
    status: string;
  }>(
    `select id,evaluator_user_id,status
     from public.evaluations
     where id=$1::uuid
       and employee_id=$2::uuid
       and status::text=any($3::text[])
     limit 1`,
    [evaluationId, context.user.employeeId, visibleStatuses],
  );
  const evaluation = result.rows[0];
  if (!evaluation) {
    throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  }

  await pool.query(
    `insert into public.audit_logs(
       organization_id,user_id,action,entity_type,entity_id,new_values,reason
     ) values(
       $1::uuid,$2::uuid,'evaluation.employee_review_requested',
       'evaluation',$3::uuid,$4::jsonb,$5
     )`,
    [
      context.organizationId,
      context.user.id,
      evaluationId,
      JSON.stringify({ employee_note: note, status: evaluation.status }),
      note,
    ],
  );

  await pool.query(
    `insert into public.notifications(
       organization_id,user_id,title,body,kind,entity_type,entity_id
     ) values(
       $1::uuid,$2::uuid,$3,$4,
       'evaluation_review_request','evaluation',$5::uuid
     )`,
    [
      context.organizationId,
      String(evaluation.evaluator_user_id),
      "طلب مراجعة تقييم",
      `${context.user.name || context.user.email}: ${note}`,
      evaluationId,
    ],
  );

  revalidatePath("/my-evaluations");
}

async function loadEvaluations(employeeId: string) {
  const result = await pool.query<EvaluationRow>(
    `select
       e.id,
       e.status::text status,
       e.weighted_score,
       e.final_score,
       e.result_label,
       e.notes,
       e.submitted_at,
       e.reviewed_at,
       e.approved_at,
       e.published_at,
       e.evaluator_user_id,
       c.name cycle_name,
       c.month,
       c.year,
       u.name evaluator_name
     from public.evaluations e
     join public.evaluation_cycles c on c.id=e.cycle_id
     left join public.users u on u.id=e.evaluator_user_id
     where e.employee_id=$1::uuid
       and e.status::text=any($2::text[])
     order by c.year desc,c.month desc,e.updated_at desc`,
    [employeeId, visibleStatuses],
  );

  const evaluations = result.rows;
  if (!evaluations.length) return [];

  const answers = await pool.query<AnswerRow>(
    `select
       evaluation_id,
       criterion_name_snapshot,
       criterion_description_snapshot,
       weight_snapshot,
       max_score_snapshot,
       score,
       comment
     from public.evaluation_answers
     where evaluation_id=any($1::uuid[])
     order by created_at`,
    [evaluations.map((evaluation) => evaluation.id)],
  );

  const byEvaluation = new Map<string, EvaluationRow["answers"]>();
  for (const answer of answers.rows) {
    const list = byEvaluation.get(String(answer.evaluation_id)) || [];
    list.push(answer);
    byEvaluation.set(String(answer.evaluation_id), list);
  }

  return evaluations.map((evaluation) => ({
    ...evaluation,
    answers: byEvaluation.get(evaluation.id) || [],
  }));
}

function ScorePills({ evaluation }: { evaluation: EvaluationRow }) {
  return (
    <div style={styles.pills}>
      <Badge>{statusLabel(evaluation.status)}</Badge>
      <Badge variant="success">
        الدرجة: {evaluation.final_score || evaluation.weighted_score || "—"}
      </Badge>
      {evaluation.result_label && (
        <Badge variant="warning">{evaluation.result_label}</Badge>
      )}
    </div>
  );
}

function AnswerCard({ answer }: { answer: AnswerRow }) {
  return (
    <div style={styles.answerCard}>
      <div style={styles.answerHeader}>
        <strong style={styles.answerTitle}>
          {answer.criterion_name_snapshot}
        </strong>
        <span style={styles.answerScore}>
          {answer.score} / {answer.max_score_snapshot}
        </span>
      </div>
      {answer.criterion_description_snapshot && (
        <p style={styles.mutedText}>{answer.criterion_description_snapshot}</p>
      )}
      {answer.comment && (
        <p style={styles.commentText}>ملاحظة المقيّم: {answer.comment}</p>
      )}
    </div>
  );
}

function ReviewForm({ evaluationId }: { evaluationId: string }) {
  return (
    <form action={requestReview} style={styles.reviewForm}>
      <input type="hidden" name="evaluation_id" value={evaluationId} />
      <Textarea
        name="review_note"
        required
        minLength={5}
        placeholder="اكتب ملاحظات طلب المراجعة..."
        style={{ minHeight: 96, resize: "vertical" }}
      />
      <Button type="submit" style={{ width: "fit-content" }}>
        طلب مراجعة
      </Button>
    </form>
  );
}

export default async function MyEvaluationsPage() {
  const context = await requireUser().catch(() => redirect("/login"));
  if (!context.user.employeeId) redirect("/");

  const evaluations = await loadEvaluations(context.user.employeeId);

  return (
    <main dir="rtl" style={styles.page}>
      <PageHeader
        title="تقييمي"
        brandMark={<span style={styles.brandIcon}>✓</span>}
        nav={
          <a
            href="/"
            style={{ color: "#fff", border: "1px solid rgba(255,255,255,.28)", borderRadius: 10, padding: "9px 13px", fontSize: 12 }}
          >
            الأنظمة
          </a>
        }
      />

      <section style={styles.shell}>
        <div style={styles.hero}>
          <h1 style={styles.title}>بيانات التقييم الخاصة بي</h1>
          <p style={styles.subtitle}>
            عرض فقط، ويمكنك طلب مراجعة للتقييم مع كتابة ملاحظاتك.
          </p>
        </div>

        {!evaluations.length ? (
          <div className="dst-empty">
            لا توجد تقييمات منشورة أو معتمدة لحسابك حاليًا.
          </div>
        ) : (
          <div style={styles.grid}>
            {evaluations.map((evaluation) => (
              <article key={evaluation.id} className="dst-card" style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <h2 style={styles.cardTitle}>{evaluation.cycle_name}</h2>
                    <p style={styles.cardMeta}>
                      {evaluation.month} / {evaluation.year} · المقيّم:{" "}
                      {evaluation.evaluator_name || "غير محدد"}
                    </p>
                  </div>
                  <ScorePills evaluation={evaluation} />
                </div>

                <div style={styles.cardBody}>
                  {evaluation.answers.map((answer, index) => (
                    <AnswerCard
                      key={`${evaluation.id}-${index}`}
                      answer={answer}
                    />
                  ))}

                  {evaluation.notes && (
                    <p style={styles.generalNotes}>
                      ملاحظات عامة: {evaluation.notes}
                    </p>
                  )}

                  <ReviewForm evaluationId={evaluation.id} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--dst-color-bg-page)",
    color: "var(--dst-color-text)",
    fontFamily: "var(--app-font)",
  },
  brandIcon: {
    width: 38,
    height: 38,
    border: "1px solid rgba(255,255,255,.38)",
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
  },
  shell: {
    width: "min(1050px, 100%)",
    margin: "0 auto",
    padding: "34px 18px 52px",
    boxSizing: "border-box",
  },
  hero: {
    marginBottom: 22,
  },
  title: {
    margin: "0 0 8px",
    fontSize: 26,
    fontWeight: 500,
  },
  subtitle: {
    margin: 0,
    color: "var(--dst-color-text-muted)",
    fontSize: 13,
  },
  grid: {
    display: "grid",
    gap: 16,
  },
  card: {
    padding: 0,
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    padding: 18,
    borderBottom: "1px solid var(--dst-color-border)",
  },
  cardTitle: {
    margin: "0 0 6px",
    fontSize: 18,
    fontWeight: 500,
  },
  cardMeta: {
    margin: 0,
    color: "var(--dst-color-text-muted)",
    fontSize: 12,
  },
  pills: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  cardBody: {
    padding: 18,
    display: "grid",
    gap: 12,
  },
  answerCard: {
    border: "1px solid var(--dst-color-border)",
    borderRadius: 14,
    padding: 14,
  },
  answerHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  answerTitle: {
    fontSize: 14,
    fontWeight: 500,
  },
  answerScore: {
    color: "var(--dst-color-primary)",
    fontSize: 13,
  },
  mutedText: {
    margin: "8px 0 0",
    color: "var(--dst-color-text-muted)",
    fontSize: 12,
    lineHeight: 1.8,
  },
  commentText: {
    margin: "8px 0 0",
    color: "#374151",
    fontSize: 13,
    lineHeight: 1.8,
  },
  generalNotes: {
    margin: 0,
    color: "#374151",
    fontSize: 13,
    lineHeight: 1.8,
  },
  reviewForm: {
    display: "grid",
    gap: 10,
    marginTop: 4,
  },
} satisfies Record<string, CSSProperties>;
