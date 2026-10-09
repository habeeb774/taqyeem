'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/server/context';
import { withNeonTransaction } from '@/lib/neon/admin';

export type ReviewState = { success: boolean; message: string };

const schema = z.object({
  evaluationId: z.string().uuid(),
  note: z.string().trim().min(5).max(2000),
});

export async function requestReview(_previous: ReviewState, formData: FormData): Promise<ReviewState> {
  try {
    const context = await requireUser();
    if (!context.user.employeeId) return { success: false, message: 'هذا الإجراء متاح للموظف المرتبط بالتقييم فقط.' };
    const input = schema.safeParse({ evaluationId: formData.get('evaluation_id'), note: formData.get('review_note') });
    if (!input.success) return { success: false, message: 'اكتب سبب المراجعة من 5 إلى 2000 حرف.' };
    const { evaluationId, note } = input.data;
    await withNeonTransaction(async client => {
      const result = await client.query(
        `select id,evaluator_user_id,status from public.evaluations
         where id=$1::uuid and employee_id=$2::uuid and organization_id=$3::uuid
           and status::text=any($4::text[]) for update`,
        [evaluationId, context.user.employeeId, context.organizationId, ['reviewed', 'approved', 'published', 'locked']],
      );
      const evaluation = result.rows[0];
      if (!evaluation) throw new Error('FORBIDDEN');
      const duplicate = await client.query(
        `select 1 from public.audit_logs where organization_id=$1::uuid and user_id=$2::uuid
         and entity_id=$3::uuid and action='evaluation.employee_review_requested' and reason=$4
         and created_at>now()-interval '1 minute' limit 1`,
        [context.organizationId, context.user.id, evaluationId, note],
      );
      if (duplicate.rows.length) return;
      await client.query(
        `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values,reason)
         values($1::uuid,$2::uuid,'evaluation.employee_review_requested','evaluation',$3::uuid,$4::jsonb,$5)`,
        [context.organizationId, context.user.id, evaluationId, JSON.stringify({ employee_note: note, status: evaluation.status }), note],
      );
      await client.query(
        `insert into public.notifications(organization_id,user_id,title,body,kind,entity_type,entity_id)
         values($1::uuid,$2::uuid,$3,$4,'evaluation_review_request','evaluation',$5::uuid)`,
        [context.organizationId, evaluation.evaluator_user_id, 'طلب مراجعة تقييم', `${context.user.name || context.user.email}: ${note}`, evaluationId],
      );
    });
    revalidatePath('/my-evaluations');
    return { success: true, message: 'تم إرسال طلب المراجعة إلى المقيّم. يمكنك متابعة تقييمك من هذه الصفحة.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { success: false, message: message === 'UNAUTHENTICATED' ? 'انتهت الجلسة. سجّل الدخول ثم أعد المحاولة.'
      : message === 'FORBIDDEN' ? 'هذا التقييم غير متاح لطلب المراجعة.' : 'تعذر إرسال الطلب. ملاحظاتك باقية؛ أعد المحاولة.' };
  }
}
