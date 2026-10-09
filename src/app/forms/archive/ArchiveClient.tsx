'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, EmptyState, Input, Table, TableCell, TableHeadCell, TableRow } from '@/components/ui';
import { STATUS_LABELS, formatTimestamp, formsApi, useReasonDialog, useToast } from '../_shared/client';

type ArchiveDocument = {
  id: string;
  document_no: string;
  form_type: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  employee_name: string | null;
  department_name: string | null;
  payload: { formName?: string; dept?: string; employee?: string } | null;
};

type ArchiveResponse = { documents: ArchiveDocument[]; total: number; totalPages: number };

const PAGE_SIZE = 25;
const CANCELLABLE = ['draft', 'submitted', 'pending_approval', 'returned_for_edit'];
const ARCHIVABLE = ['approved', 'issued'];

export function ArchiveClient({ canCancel, canArchive, canDelete }: { canCancel: boolean; canArchive: boolean; canDelete: boolean }) {
  const toast = useToast();
  const reason = useReasonDialog();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ArchiveResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const version = useRef(0);

  const load = useCallback(async (targetPage: number, search: string) => {
    const current = ++version.current;
    setLoadError(false);
    try {
      const params = new URLSearchParams({ archive: '1', page: String(targetPage), limit: String(PAGE_SIZE), q: search });
      const result = await formsApi<ArchiveResponse>(`/api/app/forms?${params}`);
      if (current !== version.current) return;
      const totalPages = Math.max(1, Number(result.totalPages || 1));
      if (targetPage > totalPages) {
        setPage(totalPages);
        return;
      }
      setData({ documents: result.documents || [], total: Number(result.total || 0), totalPages });
    } catch {
      if (current === version.current) setLoadError(true);
    }
  }, []);

  // Debounce typing; page changes load immediately.
  useEffect(() => {
    const timer = setTimeout(() => load(page, query.trim()), 300);
    return () => clearTimeout(timer);
  }, [load, page, query]);

  async function transition(doc: ArchiveDocument, action: 'cancel' | 'archive') {
    let comment = '';
    if (action === 'cancel') {
      const answer = await reason.ask('سبب إلغاء المستند');
      if (answer === null) return;
      comment = answer;
    }
    setBusyId(doc.id);
    try {
      await formsApi('/api/app/forms', { method: 'POST', body: JSON.stringify({ action, document_id: doc.id, comment }) });
      toast.show(action === 'archive' ? 'تمت أرشفة المستند' : 'تم إلغاء المستند');
      await load(page, query.trim());
    } catch (error) {
      toast.show(`تعذر تنفيذ الإجراء: ${(error as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(doc: ArchiveDocument) {
    if (!confirm(`حذف المستند ${doc.document_no} من الأرشيف؟`)) return;
    setBusyId(doc.id);
    try {
      await formsApi(`/api/app/forms?document_no=${encodeURIComponent(doc.document_no)}`, { method: 'DELETE' });
      toast.show('تم حذف المسودة');
      await load(page, query.trim());
    } catch (error) {
      toast.show(`تعذر الحذف: ${(error as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="forms-page__body">
      <div className="forms-page__toolbar">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          سجلّ المستندات {data && <span style={{ color: 'var(--dst-color-text-muted)' }}>({data.total})</span>}
        </h2>
        <Input
          type="search"
          aria-label="بحث في المستندات"
          placeholder="ابحث برقم المستند أو الموظف أو النموذج..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          style={{ maxWidth: 340, flex: '1 1 240px' }}
        />
      </div>

      {loadError ? (
        <EmptyState>
          تعذر تحميل المستندات.{' '}
          <Button variant="ghost" size="sm" onClick={() => load(page, query.trim())}>إعادة المحاولة</Button>
        </EmptyState>
      ) : !data ? (
        <EmptyState>جارٍ تحميل المستندات...</EmptyState>
      ) : !data.documents.length ? (
        <EmptyState>لا توجد مستندات مطابقة.</EmptyState>
      ) : (
        <Table>
          <thead>
            <TableRow>
              <TableHeadCell>رقم المستند</TableHeadCell>
              <TableHeadCell>النموذج</TableHeadCell>
              <TableHeadCell>الموظف</TableHeadCell>
              <TableHeadCell>الإدارة</TableHeadCell>
              <TableHeadCell>الحالة</TableHeadCell>
              <TableHeadCell>التاريخ</TableHeadCell>
              <TableHeadCell>الإجراءات</TableHeadCell>
            </TableRow>
          </thead>
          <tbody>
            {data.documents.map((doc) => {
              const payload = doc.payload || {};
              const busy = busyId === doc.id;
              return (
                <TableRow key={doc.id}>
                  <TableCell>{doc.document_no}</TableCell>
                  <TableCell>{payload.formName || doc.form_type}</TableCell>
                  <TableCell>{payload.employee || doc.employee_name || '—'}</TableCell>
                  <TableCell>{payload.dept || doc.department_name || ''}</TableCell>
                  <TableCell>{STATUS_LABELS[doc.status] || doc.status || '—'}</TableCell>
                  <TableCell>{formatTimestamp(doc.created_at || doc.updated_at)}</TableCell>
                  <TableCell>
                    <div className="forms-page__actions" style={{ justifyContent: 'flex-start' }}>
                      <a className="dst-btn dst-btn--ghost dst-btn--sm" href={`/forms/view?doc=${encodeURIComponent(doc.document_no)}`}>
                        فتح
                      </a>
                      {canCancel && CANCELLABLE.includes(doc.status) && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => transition(doc, 'cancel')}>إلغاء</Button>
                      )}
                      {canArchive && ARCHIVABLE.includes(doc.status) && (
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => transition(doc, 'archive')}>أرشفة</Button>
                      )}
                      {canDelete && doc.status === 'draft' && (
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(doc)}>حذف</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}

      {data && data.totalPages > 1 && (
        <div className="forms-page__actions" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
          <span style={{ fontSize: 13, color: 'var(--dst-color-text-muted)' }}>{page} / {data.totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>التالي</Button>
        </div>
      )}

      {reason.node}
      {toast.node}
    </div>
  );
}
