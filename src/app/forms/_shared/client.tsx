'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Modal, Textarea } from '@/components/ui';

export const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مرسل',
  pending_approval: 'قيد الموافقة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  returned_for_edit: 'معاد للتعديل',
  cancelled: 'ملغى',
  issued: 'صادر',
  archived: 'مؤرشف',
};

export function formatTimestamp(value: string | number | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** JSON fetch against /api/app/*; throws with the server's error code, redirects on 401. */
export async function formsApi<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.href = '/login';
    throw new Error('UNAUTHENTICATED');
  }
  if (!response.ok || data.ok === false) throw new Error(data.error || 'REQUEST_FAILED');
  return data;
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = message ? (
    <div role="status" className="forms-toast">
      {message}
    </div>
  ) : null;
  return { show, node };
}

/** Replaces the legacy prompt() for reasons/comments; requires at least 3 characters. */
export function useReasonDialog() {
  const [state, setState] = useState<{ title: string; resolve: (value: string | null) => void } | null>(null);
  const [text, setText] = useState('');

  const ask = useCallback(
    (title: string) =>
      new Promise<string | null>((resolve) => {
        setText('');
        setState({ title, resolve });
      }),
    [],
  );

  function finish(value: string | null) {
    state?.resolve(value);
    setState(null);
  }

  const valid = text.trim().length >= 3;
  const node: ReactNode = (
    <Modal
      open={Boolean(state)}
      onClose={() => finish(null)}
      title={state?.title || ''}
      titleId="forms-reason-title"
      actions={
        <>
          <Button variant="ghost" onClick={() => finish(null)}>
            إلغاء
          </Button>
          <Button disabled={!valid} onClick={() => finish(text.trim())}>
            تأكيد
          </Button>
        </>
      }
    >
      <Field id="forms-reason" label="الملاحظة" hint="اكتب ملاحظة واضحة (3 أحرف على الأقل)">
        <Textarea id="forms-reason" rows={3} value={text} onChange={(event) => setText(event.target.value)} autoFocus />
      </Field>
    </Modal>
  );

  return { ask, node };
}
