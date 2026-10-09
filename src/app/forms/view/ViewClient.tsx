'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, EmptyState } from '@/components/ui';
import { STATUS_LABELS, formsApi, useToast } from '../_shared/client';
import { buildDocumentHtml, buildPrintPage, printPage, type FormDefinition, type FormState } from '../_shared/document';

type Doc = {
  id: string;
  document_no: string;
  form_type: string;
  status: string;
  department_name: string | null;
  payload: { formId?: string; formName?: string; dept?: string; state?: FormState } | null;
};

type Template = { template_key: string; name: string; definition: FormDefinition | null };

export function ViewClient({ documentNo, canPrint }: { documentNo: string; canPrint: boolean }) {
  const toast = useToast();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ archive: '1', limit: '10', q: documentNo });
      const [archive, catalogue] = await Promise.all([
        formsApi<{ documents: Doc[] }>(`/api/app/forms?${params}`),
        formsApi<{ templates: Template[] }>('/api/app/forms?templates=1'),
      ]);
      const found = (archive.documents || []).find((d) => d.document_no === documentNo);
      if (!found) {
        setError('تعذر العثور على المستند.');
        return;
      }
      const formId = found.payload?.formId || found.form_type;
      const template = (catalogue.templates || []).find((t) => t.template_key === formId);
      if (!template) {
        setError('نموذج هذا المستند لم يعد متاحًا.');
        return;
      }
      setDoc(found);
      setForm({ ...(template.definition || {}), name: template.name });
    } catch {
      setError('تعذر تحميل المستند.');
    }
  }, [documentNo]);

  useEffect(() => {
    load();
  }, [load]);

  const page = useMemo(() => {
    if (!doc || !form) return null;
    const state = doc.payload?.state || {};
    const inner = buildDocumentHtml(form, state, {
      formId: doc.payload?.formId || doc.form_type,
      documentNo: doc.document_no,
      deptFallback: doc.payload?.dept || doc.department_name || undefined,
    });
    return buildPrintPage(inner, state.docTitle || form.name || doc.document_no);
  }, [doc, form]);

  async function print() {
    if (!doc || !page) return;
    setPrinting(true);
    try {
      // Same audit trail as the legacy editor: every print is logged server-side first.
      await formsApi('/api/app/forms/print', { method: 'POST', body: JSON.stringify({ document_id: doc.id }) });
      printPage(page);
    } catch (err) {
      toast.show((err as Error).message === 'FORBIDDEN' ? 'ليس لديك صلاحية طباعة هذا المستند' : 'تعذر طباعة المستند');
    } finally {
      setPrinting(false);
    }
  }

  if (error) {
    return (
      <div className="forms-page__body">
        <EmptyState>
          {error} <a href="/forms/archive">العودة إلى السجل</a>
        </EmptyState>
      </div>
    );
  }
  if (!doc || !page) {
    return (
      <div className="forms-page__body">
        <EmptyState>جارٍ تحميل المستند...</EmptyState>
      </div>
    );
  }

  return (
    <div className="forms-page__body">
      <div className="forms-page__toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{doc.payload?.formName || form?.name}</h2>
          <span style={{ color: 'var(--dst-color-text-muted)', fontSize: 13 }} dir="ltr">{doc.document_no}</span>
          <Badge>{STATUS_LABELS[doc.status] || doc.status}</Badge>
        </div>
        <div className="forms-page__actions">
          <a className="dst-btn dst-btn--ghost dst-btn--md" href="/forms/archive">رجوع</a>
          <a className="dst-btn dst-btn--ghost dst-btn--md" href={`/forms/edit?doc=${encodeURIComponent(doc.document_no)}`}>فتح في المحرّر</a>
          {canPrint && (
            <Button onClick={print} disabled={printing}>{printing ? 'جارٍ التحضير...' : 'طباعة / PDF'}</Button>
          )}
        </div>
      </div>
      <iframe title="معاينة المستند" className="forms-preview" sandbox="allow-same-origin" srcDoc={page} />
      {toast.node}
    </div>
  );
}
