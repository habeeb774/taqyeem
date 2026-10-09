'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, EmptyState, Input, Select, Textarea } from '@/components/ui';
import { formsApi, useToast } from '../_shared/client';
import {
  buildDocumentHtml,
  buildPrintPage,
  computeInstallments,
  formatAmount,
  printPage,
  type FieldDef,
  type FormDefinition,
} from '../_shared/document';
import {
  DEFAULT_DEPT,
  DOC_FONTS,
  NUMBER_PREFIX,
  draftDocumentNo,
  employeeAutofill,
  firstMissingField,
  initialState,
  withOfferTotal,
  type EditorState,
  type Employee,
} from '../_shared/editor-state';

type Template = { template_key: string; name: string; description: string | null; definition: FormDefinition | null };
type SavedDoc = { id: string; document_no: string; form_type: string; status: string; payload: { formId?: string; state?: EditorState; draft?: EditorState } | null };
type Lookup = { id: string; name: string };
type Can = { create: boolean; print: boolean; submit: boolean };

export function EditorClient({
  formKey,
  documentNo,
  userId,
  isEmployeeRole,
  ownEmployeeId,
  can,
}: {
  formKey: string | null;
  documentNo: string | null;
  userId: string;
  isEmployeeRole: boolean;
  ownEmployeeId: string | null;
  can: Can;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [formId, setFormId] = useState<string | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [docNo, setDocNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<{ branches: Lookup[]; departments: Lookup[] }>({ branches: [], departments: [] });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<EditorState | null>(null);
  const dirty = useRef(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      try {
        const [catalogue, lookupData] = await Promise.all([
          formsApi<{ templates: Template[] }>('/api/app/forms?templates=1'),
          formsApi<{ branches: Lookup[]; departments: Lookup[] }>('/api/app/form-data?lookups=1').catch(() => ({ branches: [], departments: [] })),
        ]);
        setLookups({ branches: lookupData.branches || [], departments: lookupData.departments || [] });

        let opened: SavedDoc | null = null;
        if (documentNo) {
          const params = new URLSearchParams({ archive: '1', limit: '10', q: documentNo });
          const result = await formsApi<{ documents: SavedDoc[] }>(`/api/app/forms?${params}`);
          opened = (result.documents || []).find((d) => d.document_no === documentNo) || null;
          if (!opened) return setError('تعذر العثور على المستند.');
        }
        const key = opened ? opened.payload?.formId || opened.form_type : formKey!;
        const template = (catalogue.templates || []).find((t) => t.template_key === key);
        if (!template) return setError('هذا النموذج غير متاح.');
        const definition: FormDefinition = { ...(template.definition || {}), name: template.name };
        setForm(definition);
        setFormId(key);

        if (opened) {
          setState({ ...initialState(key, definition), ...(opened.payload?.state || {}), formId: key });
          setDocNo(opened.document_no);
          return;
        }

        let fresh = initialState(key, definition);
        if (isEmployeeRole && ownEmployeeId) {
          const own = await formsApi<{ employees: Employee[] }>(`/api/app/form-data?limit=30&q=`).catch(() => ({ employees: [] }));
          const me = (own.employees || []).find((e) => String(e.id) === ownEmployeeId);
          if (me) fresh = { ...fresh, employeeId: me.id, inputs: { ...fresh.inputs, ...employeeAutofill(definition, fresh, me, 'emp_name') } };
        }
        setState(fresh);

        if (can.create) {
          const drafts = await formsApi<{ documents: SavedDoc[] }>('/api/app/forms?type=__draft__&limit=100').catch(() => ({ documents: [] }));
          const draft = (drafts.documents || []).find((d) => d.document_no === draftDocumentNo(userId, key) && d.payload?.draft);
          if (draft?.payload?.draft) setPendingDraft(draft.payload.draft);
        }
      } catch {
        setError('تعذر تحميل النموذج.');
      }
    })();
  }, [formKey, documentNo, userId, isEmployeeRole, ownEmployeeId, can.create]);

  // ---------- drafts ----------
  const persistDraft = useCallback(
    (snapshot: EditorState) => {
      const run = saveQueue.current.then(() =>
        formsApi('/api/app/forms', {
          method: 'POST',
          body: JSON.stringify({
            form_type: '__draft__',
            document_no: draftDocumentNo(userId, snapshot.formId),
            status: 'draft',
            payload: { formId: snapshot.formId, draft: { ...snapshot, ts: Date.now() } },
          }),
        }),
      );
      saveQueue.current = run.catch(() => undefined);
      return run;
    },
    [userId],
  );

  const clearDraft = useCallback(
    (id: string) => {
      const run = saveQueue.current.then(() =>
        fetch(`/api/app/forms?document_no=${encodeURIComponent(draftDocumentNo(userId, id))}`, { method: 'DELETE', credentials: 'same-origin' }),
      );
      saveQueue.current = run.catch(() => undefined);
      return run.then((r) => r.ok || r.status === 404).catch(() => false);
    },
    [userId],
  );

  // Autosave 800ms after the last change, only for new (unissued) documents.
  useEffect(() => {
    if (!state || !dirty.current || !can.create || docNo) return;
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await persistDraft(state);
        dirty.current = false;
        setSaveStatus('saved');
      } catch {
        setSaveStatus('failed');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [state, can.create, docNo, persistDraft]);

  const update = useCallback((patch: Partial<EditorState> | ((s: EditorState) => EditorState)) => {
    dirty.current = true;
    setState((current) => {
      if (!current) return current;
      const next = typeof patch === 'function' ? patch(current) : { ...current, ...patch };
      return { ...next, inputs: withOfferTotal(next.inputs || {}) };
    });
  }, []);

  const setInputs = useCallback(
    (values: Record<string, string>) => update((s) => ({ ...s, inputs: { ...s.inputs, ...values } })),
    [update],
  );

  // ---------- preview ----------
  const [previewState, setPreviewState] = useState<EditorState | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewState(state), 250);
    return () => clearTimeout(timer);
  }, [state]);
  const preview = useMemo(() => {
    if (!form || !formId || !previewState) return null;
    return buildPrintPage(buildDocumentHtml(form, previewState, { formId, documentNo: docNo, deptFallback: DEFAULT_DEPT }), previewState.docTitle || form.name || '');
  }, [form, formId, previewState, docNo]);

  // ---------- actions ----------
  function validate() {
    const missing = form && state ? firstMissingField(form, state) : null;
    if (missing) {
      toast.show(`يرجى تعبئة: ${missing.label}`);
      document.getElementById(`field-${missing.id}`)?.focus();
      return false;
    }
    return true;
  }

  async function nextNumber() {
    const result = await formsApi<{ document_no: string }>('/api/app/forms', {
      method: 'POST',
      body: JSON.stringify({ action: 'next_number', prefix: NUMBER_PREFIX, sequence_key: NUMBER_PREFIX }),
    });
    if (!result.document_no?.trim()) throw new Error('تعذر الحصول على رقم المستند');
    return result.document_no;
  }

  async function saveDocument(number: string, status: 'draft' | 'issued') {
    const s = state!;
    const inputs = s.inputs || {};
    const employee = inputs.f_emp_name || inputs.f_pay_to || '—';
    const result = await formsApi<{ document: { id: string } }>('/api/app/forms', {
      method: 'POST',
      body: JSON.stringify({
        form_type: formId,
        document_no: number,
        employee_id: s.employeeId || null,
        status,
        payload: { state: { ...s, ts: Date.now() }, formId, formName: s.docTitle || form!.name, dept: s.docDept || DEFAULT_DEPT, employee },
      }),
    });
    return result.document;
  }

  async function issueAndPrint() {
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const number = docNo || (await nextNumber());
      setDocNo(number);
      const saved = await saveDocument(number, 'issued');
      await formsApi('/api/app/forms/print', { method: 'POST', body: JSON.stringify({ document_id: saved.id }) });
      printPage(buildPrintPage(buildDocumentHtml(form!, state!, { formId: formId!, documentNo: number, deptFallback: DEFAULT_DEPT }), state!.docTitle || form!.name || ''));
      dirty.current = false;
      const cleared = await clearDraft(formId!);
      toast.show(`تم إصدار المستند رقم ${number}${cleared ? '' : '، لكن تعذر إزالة المسودة القديمة'}`);
    } catch (err) {
      toast.show(`تعذر حفظ المستند قبل الطباعة: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitForApproval() {
    if (busy || !validate()) return;
    setBusy(true);
    try {
      const number = docNo || (await nextNumber());
      setDocNo(number);
      const saved = await saveDocument(number, 'draft');
      const result = await formsApi<{ status: string }>('/api/app/forms', { method: 'POST', body: JSON.stringify({ action: 'submit', document_id: saved.id }) });
      dirty.current = false;
      const cleared = await clearDraft(formId!);
      toast.show(`${result.status === 'pending_approval' ? 'تم إرسال النموذج للموافقات' : 'تم إرسال النموذج'}${cleared ? '' : '، لكن تعذر إزالة المسودة القديمة'}`);
    } catch (err) {
      toast.show(`تعذر إرسال النموذج: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function printBlank() {
    printPage(buildPrintPage(buildDocumentHtml(form!, state!, { formId: formId!, blank: true, deptFallback: DEFAULT_DEPT }), state!.docTitle || form!.name || ''));
  }

  async function leave() {
    if (dirty.current && can.create && !docNo && state) {
      try {
        await persistDraft(state);
      } catch {
        toast.show('لم تُحفظ آخر التعديلات. أعد المحاولة قبل مغادرة الصفحة');
        return;
      }
    }
    location.assign(docNo ? '/forms/archive' : '/forms');
  }

  // ---------- render ----------
  if (error) {
    return (
      <div className="forms-page__body">
        <EmptyState>
          {error} <a href="/forms">العودة إلى النماذج</a>
        </EmptyState>
      </div>
    );
  }
  if (!form || !state || !formId) {
    return (
      <div className="forms-page__body">
        <EmptyState>جارٍ تحميل النموذج...</EmptyState>
      </div>
    );
  }

  const inputs = state.inputs || {};
  const hidden = state.hiddenFields || {};
  const extra = state.extraFields || {};
  const fieldProps = {
    inputs,
    hidden,
    labelOf: (fl: FieldDef) => state.labelOverrides?.[fl.id] ?? fl.label,
    setInputs,
    toggleHidden: (id: string) => update((s) => ({ ...s, hiddenFields: { ...s.hiddenFields, [id]: !s.hiddenFields?.[id] } })),
    lookups,
    onPickEmployee: (fl: FieldDef, employee: Employee) =>
      update((s) => ({ ...s, employeeId: fl.id === 'pay_to' ? s.employeeId : employee.id, inputs: { ...s.inputs, ...employeeAutofill(form, s, employee, fl.id) } })),
  };
  const statusText = { idle: '', saving: 'جارٍ حفظ المسودة...', saved: 'تم حفظ المسودة', failed: 'تعذر حفظ المسودة' }[saveStatus];

  return (
    <div className="forms-editor">
      <div className="forms-editor__panel">
        <div className="forms-page__toolbar">
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{form.name}</h2>
          {docNo ? <span dir="ltr" style={{ fontSize: 13, color: 'var(--dst-color-text-muted)' }}>{docNo}</span> : (
            <span role="status" style={{ fontSize: 12, color: saveStatus === 'failed' ? 'var(--dst-color-danger, #c43232)' : 'var(--dst-color-text-muted)' }}>{statusText}</span>
          )}
        </div>

        {pendingDraft && (
          <div className="forms-editor__notice">
            توجد مسودّة محفوظة لهذا النموذج.
            <Button size="sm" onClick={() => { setState({ ...initialState(formId, form), ...pendingDraft, formId, docDept: DEFAULT_DEPT }); setPendingDraft(null); toast.show('تم استعادة المسودّة'); }}>استعادة</Button>
            <Button size="sm" variant="ghost" onClick={() => { setPendingDraft(null); clearDraft(formId); }}>تجاهل</Button>
          </div>
        )}

        <Group title="رأس المستند">
          <Row label="عنوان المستند"><Input value={state.docTitle || ''} onChange={(e) => update({ docTitle: e.target.value })} /></Row>
          <Row label="الإدارة"><Input value={state.docDept || ''} onChange={(e) => update({ docDept: e.target.value })} /></Row>
          <Row label="خط المستند">
            <Select value={state.font || DOC_FONTS[0][0]} onChange={(e) => update({ font: e.target.value })}>
              {DOC_FONTS.map(([fam, label]) => <option key={fam} value={fam}>{label}</option>)}
            </Select>
          </Row>
        </Group>

        {(form.sections || []).map((sec, si) => {
          if (sec.fixed) return null;
          const fields = (sec.fields || []).concat(extra[`sec${si}`] || []);
          if (sec.free) {
            const fld = fields[0];
            if (!fld || state.clauseRemoved?.[fld.id]) return null;
            return (
              <Group key={si} title={sec.title || 'نص المستند'}>
                <RichText value={inputs[`f_${fld.id}`] || ''} onChange={(html) => setInputs({ [`f_${fld.id}`]: html })} placeholder="اكتب النص هنا..." />
              </Group>
            );
          }
          return (
            <Group key={si} title={sec.title || sec.line?.replace(/<[^>]+>/g, '').slice(0, 40) || ''}>
              {fields.map((fl) => <FieldRow key={fl.id} field={fl} {...fieldProps} />)}
            </Group>
          );
        })}

        {(state.clauseExtra || []).map((c) => (
          <Group key={c.id} title={c.title}>
            <RichText value={inputs[`f_${c.id}`] || ''} onChange={(html) => setInputs({ [`f_${c.id}`]: html })} placeholder="نص البند..." />
          </Group>
        ))}

        {form.itemsTable && (
          <Group title={form.itemsTable.title}>
            <ItemsTable
              cols={form.itemsTable.cols}
              rows={state.items || []}
              onChange={(items) => update({ items })}
            />
          </Group>
        )}

        {(form.sections2 || []).map((sec, si) => (
          <Group key={`s2-${si}`} title={sec.title || ''}>
            {(sec.fields || []).concat(extra[`s2_${si}`] || []).map((fl) => <FieldRow key={fl.id} field={fl} {...fieldProps} />)}
          </Group>
        ))}

        {form.installments && <Installments inputs={inputs} setInputs={setInputs} />}

        {form.pledge && (
          <Group title="تعهد وإقرار">
            <RichText value={inputs.f_pledge_text || ''} onChange={(html) => setInputs({ f_pledge_text: html })} placeholder="نص الإقرار..." />
            <Button size="sm" variant="ghost" onClick={() => setInputs({ f_pledge_text: form.pledge! })}>استعادة النص الأصلي</Button>
          </Group>
        )}

        {form.delivery && (
          <Group title="بيانات التسليم">
            {form.delivery.map((fl) => <FieldRow key={fl.id} field={fl} {...fieldProps} />)}
          </Group>
        )}

        {form.returnBlock && (
          <Group title={form.returnBlock.title}>
            {form.returnBlock.fields.map((fl) => <FieldRow key={fl.id} field={fl} {...fieldProps} />)}
            {form.returnBlock.checks && (
              <Row label={form.returnBlock.checks.label}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
                  {form.returnBlock.checks.options.map((o, i) => {
                    const id = `chk_${i}`;
                    const on = (state.checks || []).includes(id);
                    return (
                      <label key={id}>
                        <input type="checkbox" checked={on} onChange={() => update((s) => ({ ...s, checks: on ? (s.checks || []).filter((x) => x !== id) : [...(s.checks || []), id] }))} /> {o}
                      </label>
                    );
                  })}
                </div>
              </Row>
            )}
          </Group>
        )}

        <Group title="التوقيعات">
          {(state.sigs || []).map((sig, i) => (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <Input aria-label={`التوقيع ${i + 1}`} value={sig} onChange={(e) => update((s) => ({ ...s, sigs: (s.sigs || []).map((x, k) => (k === i ? e.target.value : x)) }))} />
              <Button size="sm" variant="ghost" onClick={() => update((s) => ({ ...s, sigs: (s.sigs || []).filter((_, k) => k !== i) }))}>حذف</Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => update((s) => ({ ...s, sigs: [...(s.sigs || []), 'توقيع'] }))}>إضافة توقيع</Button>
        </Group>

        <div className="forms-editor__actions">
          <Button variant="ghost" onClick={leave} disabled={busy}>رجوع</Button>
          <a className="dst-btn dst-btn--ghost dst-btn--md" href={docNo ? `/forms/editor?open=${encodeURIComponent(docNo)}` : `/forms/editor?form=${encodeURIComponent(formId)}`}>
            المحرّر الكلاسيكي
          </a>
          {can.print && <Button variant="ghost" onClick={printBlank} disabled={busy}>طباعة نسخة فارغة</Button>}
          {can.submit && <Button variant="ghost" onClick={submitForApproval} disabled={busy}>إرسال للاعتماد</Button>}
          {can.print && <Button onClick={issueAndPrint} disabled={busy}>{busy ? 'جارٍ التنفيذ...' : 'إصدار وطباعة'}</Button>}
        </div>
      </div>

      <div className="forms-editor__preview">
        {preview && <iframe title="معاينة المستند" className="forms-preview" sandbox="allow-same-origin" srcDoc={preview} />}
      </div>
      {toast.node}
    </div>
  );
}

// ---------- pieces ----------

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="forms-editor__group">
      {title && <h3 className="forms-editor__group-title">{title}</h3>}
      {children}
    </section>
  );
}

function Row({ label, children, htmlFor, actions }: { label: string; children: ReactNode; htmlFor?: string; actions?: ReactNode }) {
  return (
    <div className="forms-editor__row">
      <label className="forms-editor__label" htmlFor={htmlFor}>
        {label}
        {actions}
      </label>
      {children}
    </div>
  );
}

function FieldRow({
  field,
  inputs,
  hidden,
  labelOf,
  setInputs,
  toggleHidden,
  lookups,
  onPickEmployee,
}: {
  field: FieldDef;
  inputs: Record<string, string>;
  hidden: Record<string, boolean>;
  labelOf: (fl: FieldDef) => string;
  setInputs: (values: Record<string, string>) => void;
  toggleHidden: (id: string) => void;
  lookups: { branches: Lookup[]; departments: Lookup[] };
  onPickEmployee: (fl: FieldDef, employee: Employee) => void;
}) {
  if (field.id === 'inst_values') return null;
  const key = `f_${field.id}`;
  const id = `field-${field.id}`;
  const value = inputs[key] || '';
  const set = (v: string) => setInputs({ [key]: v });
  const isHidden = Boolean(hidden[field.id]);
  const hideButton = (
    <button type="button" className="forms-editor__hide" onClick={() => toggleHidden(field.id)} title={isHidden ? 'إظهار في المستند' : 'إخفاء من المستند'}>
      {isHidden ? 'مخفي' : 'إخفاء'}
    </button>
  );
  const label = `${labelOf(field)}${field.req ? ' *' : ''}`;

  let control: ReactNode;
  if (field.type === 'employee_picker' || ['emp_name', 'pay_to', 'emp_no'].includes(field.id)) {
    control = <EmployeePicker id={id} value={value} onChange={set} onPick={(e) => onPickEmployee(field, e)} byNumber={field.id === 'emp_no'} />;
  } else if (field.type === 'select') {
    control = (
      <>
        <Select id={id} value={value} onChange={(e) => setInputs({ [key]: e.target.value, ...(e.target.value !== '__manual__' ? { [`m_${field.id}`]: '' } : {}) })}>
          <option value="">—</option>
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__manual__">✎ كتابة يدوية...</option>
        </Select>
        {value === '__manual__' && <Input aria-label="قيمة يدوية" placeholder="اكتب القيمة يدوياً" value={inputs[`m_${field.id}`] || ''} onChange={(e) => setInputs({ [`m_${field.id}`]: e.target.value })} />}
      </>
    );
  } else if (field.type === 'department_picker' || field.type === 'branch_picker') {
    const list = field.type === 'department_picker' ? lookups.departments : lookups.branches;
    control = (
      <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">—</option>
        {list.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
      </Select>
    );
  } else if (field.type === 'textarea') {
    control = <Textarea id={id} rows={4} value={value} onChange={(e) => set(e.target.value)} />;
  } else if (field.type === 'date') {
    control = <Input id={id} type="date" dir="ltr" value={value} onChange={(e) => set(e.target.value)} />;
  } else {
    control = <Input id={id} type={field.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => set(e.target.value)} readOnly={field.id === 'total_salary'} />;
  }

  return (
    <div className={`forms-editor__row${isHidden ? ' is-hidden' : ''}`}>
      <label className="forms-editor__label" htmlFor={id}>
        {label}
        {hideButton}
      </label>
      {control}
    </div>
  );
}

function EmployeePicker({ id, value, onChange, onPick, byNumber }: { id: string; value: string; onChange: (v: string) => void; onPick: (e: Employee) => void; byNumber: boolean }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Employee[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const current = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const data = await formsApi<{ employees: Employee[] }>(`/api/app/form-data?limit=30&q=${encodeURIComponent(value.trim())}`);
        if (current === seq.current) setResults(data.employees || []);
      } catch {
        if (current === seq.current) setResults([]);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [value, open]);

  return (
    <div className="forms-emp">
      <Input
        id={id}
        value={value}
        dir={byNumber ? 'ltr' : undefined}
        autoComplete="off"
        placeholder={byNumber ? 'ابحث بالرقم الوظيفي...' : 'ابحث بالاسم أو اكتب يدوياً...'}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {open && results.length > 0 && (
        <div className="forms-emp__drop" role="listbox">
          {results.map((e) => (
            <button key={e.id} type="button" role="option" aria-selected={false} className="forms-emp__opt" onMouseDown={() => { onPick(e); setOpen(false); }}>
              <span>{e.full_name}</span>
              <span className="forms-emp__meta">{[e.employee_number, e.department_name].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rich text body (bold/alignment from the legacy editor survive); pasted content is kept as plain text. */
function RichText({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value && document.activeElement !== ref.current) ref.current.innerHTML = value;
  }, [value]);
  return (
    <div className="forms-editor__rich-wrap">
      <div className="forms-editor__rich-tools">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { document.execCommand('bold'); onChange(ref.current?.innerHTML || ''); }} title="تعريض النص المحدد"><b>B</b></button>
      </div>
      <div
        ref={ref}
        className="forms-editor__rich"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={() => onChange(ref.current?.innerHTML || '')}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        }}
      />
    </div>
  );
}

function ItemsTable({ cols, rows, onChange }: { cols: { id: string; label: string; type?: string }[]; rows: Record<string, string>[]; onChange: (rows: Record<string, string>[]) => void }) {
  const list = rows.length ? rows : [{}, {}];
  const setCell = (r: number, c: string, v: string) => onChange(list.map((row, i) => (i === r ? { ...row, [c]: v } : row)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="dst-table">
        <thead>
          <tr>{cols.map((c) => <th key={c.id}>{c.label}</th>)}<th /></tr>
        </thead>
        <tbody>
          {list.map((row, r) => (
            <tr key={r}>
              {cols.map((c) => (
                <td key={c.id}>
                  <Input aria-label={c.label} type={c.type === 'date' ? 'date' : 'text'} value={row[c.id] || ''} onChange={(e) => setCell(r, c.id, e.target.value)} />
                </td>
              ))}
              <td><Button size="sm" variant="ghost" onClick={() => onChange(list.filter((_, i) => i !== r))}>حذف</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button size="sm" variant="ghost" onClick={() => onChange([...list, {}])}>إضافة صف</Button>
    </div>
  );
}

function Installments({ inputs, setInputs }: { inputs: Record<string, string>; setInputs: (values: Record<string, string>) => void }) {
  const r = computeInstallments(inputs);
  // Changing the amount or count resets custom splits (legacy wireInstallments behaviour).
  const last = useRef({ amount: inputs.f_amount, count: inputs.f_inst_count });
  useEffect(() => {
    if (last.current.amount !== inputs.f_amount || last.current.count !== inputs.f_inst_count) {
      last.current = { amount: inputs.f_amount, count: inputs.f_inst_count };
      if (inputs.f_inst_values) setInputs({ f_inst_values: '' });
    }
  }, [inputs.f_amount, inputs.f_inst_count, inputs.f_inst_values, setInputs]);

  const total = Math.round(r.parts.reduce((a, b) => a + b, 0) * 100) / 100;
  return (
    <Group title="جدول الدفعات">
      {!r.parts.length ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--dst-color-text-muted)' }}>{r.amount ? 'اختر عدد الدفعات' : 'أدخل المبلغ واختر عدد الدفعات'}</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
            {r.parts.map((p, i) => (
              <label key={i} style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                الدفعة {i + 1}
                <Input
                  inputMode="decimal"
                  defaultValue={formatAmount(p)}
                  key={`${inputs.f_inst_values || 'even'}-${i}`}
                  onBlur={(e) => {
                    const parts = r.parts.slice();
                    parts[i] = parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0;
                    setInputs({ f_inst_values: parts.join(',') });
                  }}
                />
              </label>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: total === Math.round(r.amount * 100) / 100 ? 'var(--dst-color-text-muted)' : '#c43232' }}>
            مجموع الدفعات {formatAmount(total)} من {formatAmount(r.amount)} ريال
          </p>
          <Button size="sm" variant="ghost" onClick={() => setInputs({ f_inst_values: '' })}>إعادة التوزيع بالتساوي</Button>
        </>
      )}
    </Group>
  );
}
