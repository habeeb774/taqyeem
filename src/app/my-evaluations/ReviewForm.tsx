'use client';

import { useActionState, useState } from 'react';
import { Button, Field, Textarea } from '@/components/ui';
import { requestReview } from './actions';

export function ReviewForm({ evaluationId }: { evaluationId: string }) {
  const [state, action, pending] = useActionState(requestReview, { success: false, message: '' });
  const [note, setNote] = useState('');
  const fieldId = `review-note-${evaluationId}`;
  return (
    <form action={action} style={{ display: 'grid', gap: 10, marginTop: 4 }}>
      <input type="hidden" name="evaluation_id" value={evaluationId} />
      <Field id={fieldId} label="سبب طلب المراجعة" hint="وضح الدرجة أو المعيار الذي تريد مراجعته (5 أحرف على الأقل).">
        <Textarea id={fieldId} name="review_note" required minLength={5} maxLength={2000}
          value={note} onChange={event => setNote(event.target.value)}
          disabled={pending || state.success} aria-describedby={`${fieldId}-hint`}
          placeholder="اكتب ملاحظات طلب المراجعة..." style={{ minHeight: 96, resize: 'vertical' }} />
      </Field>
      {state.message && <p role={state.success ? 'status' : 'alert'} style={{ margin: 0, color: state.success ? '#169b62' : '#c43232' }}>{state.message}</p>}
      <Button type="submit" disabled={pending || state.success} style={{ width: 'fit-content' }}>
        {pending ? 'جارٍ إرسال الطلب...' : state.success ? 'تم إرسال طلب المراجعة' : 'إرسال طلب المراجعة'}
      </Button>
    </form>
  );
}
