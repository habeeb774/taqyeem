'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Table, TableCell, TableHeadCell, TableRow } from '@/components/ui';
import { formsApi, useReasonDialog, useToast } from '../_shared/client';

type Approval = { document_id: string; document_no: string | null; form_type: string | null; step_order: number | null };
type Action = 'approve' | 'reject' | 'return';

const DONE_MESSAGES: Record<Action, string> = {
  approve: 'تم اعتماد الخطوة',
  reject: 'تم رفض المستند',
  return: 'تمت إعادة المستند للتعديل',
};

export function ApprovalsClient({ canApprove, canReject }: { canApprove: boolean; canReject: boolean }) {
  const toast = useToast();
  const reason = useReasonDialog();
  const [rows, setRows] = useState<Approval[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const result = await formsApi<{ approvals: Approval[] }>('/api/app/forms?approvals=1');
      setRows(result.approvals || []);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(documentId: string, action: Action) {
    let comment = '';
    if (action !== 'approve') {
      const answer = await reason.ask(action === 'reject' ? 'سبب الرفض' : 'ملاحظة الإعادة للتعديل');
      if (answer === null) return;
      comment = answer;
    }
    setBusyId(documentId);
    try {
      await formsApi('/api/app/forms', {
        method: 'POST',
        body: JSON.stringify({ action, document_id: documentId, comment }),
      });
      toast.show(DONE_MESSAGES[action]);
      await load();
    } catch (error) {
      toast.show(`تعذر تنفيذ الإجراء: ${(error as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="forms-page__body">
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
        الموافقات المعلّقة عليك {rows && <span style={{ color: 'var(--dst-color-text-muted)' }}>({rows.length})</span>}
      </h2>

      {loadError ? (
        <EmptyState>
          تعذر تحميل الموافقات. <Button variant="ghost" size="sm" onClick={load}>إعادة المحاولة</Button>
        </EmptyState>
      ) : !rows ? (
        <EmptyState>جارٍ تحميل الموافقات...</EmptyState>
      ) : !rows.length ? (
        <EmptyState>لا توجد موافقات معلّقة عليك.</EmptyState>
      ) : (
        <Table>
          <thead>
            <TableRow>
              <TableHeadCell>رقم المستند</TableHeadCell>
              <TableHeadCell>النموذج</TableHeadCell>
              <TableHeadCell>الخطوة</TableHeadCell>
              <TableHeadCell>الإجراءات</TableHeadCell>
            </TableRow>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busy = busyId === row.document_id;
              return (
                <TableRow key={row.document_id}>
                  <TableCell>{row.document_no || '—'}</TableCell>
                  <TableCell>{row.form_type || '—'}</TableCell>
                  <TableCell>{Number(row.step_order) || 1}</TableCell>
                  <TableCell>
                    <div className="forms-page__actions" style={{ justifyContent: 'flex-start' }}>
                      {canApprove && (
                        <Button size="sm" disabled={busy} onClick={() => act(row.document_id, 'approve')}>اعتماد</Button>
                      )}
                      {canApprove && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(row.document_id, 'return')}>إعادة للتعديل</Button>
                      )}
                      {canReject && (
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => act(row.document_id, 'reject')}>رفض</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}

      {reason.node}
      {toast.node}
    </div>
  );
}
