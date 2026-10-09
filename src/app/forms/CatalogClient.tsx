'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Field, Input, Modal, Select } from '@/components/ui';
import { formsApi, useToast } from './_shared/client';
import { FORM_ICONS } from './_shared/icons';

type Template = {
  template_key: string;
  name: string;
  category: string | null;
  icon: string | null;
  description: string | null;
  definition: { icon?: string; desc?: string } | null;
};

type BuilderField = { label: string; id: string; type: string; req: boolean; binding: string };

const CATEGORIES = [
  ['خطابات', 'خطابات'],
  ['نماذج', 'نماذج إدارية'],
  ['تقييم', 'تقييم'],
];

const FIELD_TYPES = [
  ['text', 'نص'],
  ['number', 'رقم'],
  ['date', 'تاريخ'],
  ['select', 'قائمة'],
  ['textarea', 'نص طويل'],
  ['employee_picker', 'اختيار موظف'],
  ['department_picker', 'اختيار إدارة'],
  ['branch_picker', 'اختيار فرع'],
  ['signature', 'توقيع'],
];

const BINDINGS = [
  ['', 'بدون ربط تلقائي'],
  ['employee.full_name', 'اسم الموظف'],
  ['employee.employee_number', 'الرقم الوظيفي'],
  ['employee.department_name', 'الإدارة'],
  ['employee.branch_name', 'الفرع'],
  ['employee.job_title_name', 'المسمى الوظيفي'],
  ['employee.manager_name', 'المدير المباشر'],
  ['employee.phone', 'الجوال'],
  ['employee.email', 'البريد الإلكتروني'],
];

const defaultFields = (): BuilderField[] => [
  { label: 'اسم الموظف', id: 'emp_name', type: 'employee_picker', req: true, binding: 'employee.full_name' },
  { label: 'التاريخ', id: 'date', type: 'date', req: true, binding: '' },
  { label: 'التفاصيل', id: 'details', type: 'textarea', req: false, binding: '' },
];

export function CatalogClient({ canManageTemplates }: { canManageTemplates: boolean }) {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const result = await formsApi<{ templates: Template[] }>('/api/app/forms?templates=1');
      setTemplates(result.templates || []);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim();
    return (templates || []).filter((t) => {
      const desc = t.description || t.definition?.desc || '';
      return !q || t.name.includes(q) || desc.includes(q);
    });
  }, [templates, query]);

  return (
    <div className="forms-page__body">
      <div className="forms-page__toolbar">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          النماذج {templates && <span style={{ color: 'var(--dst-color-text-muted)' }}>({visible.length})</span>}
        </h2>
        <div className="forms-page__actions" style={{ flex: '1 1 300px' }}>
          <Input
            type="search"
            aria-label="بحث عن نموذج"
            placeholder="ابحث عن نموذج..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ maxWidth: 320, flex: '1 1 200px' }}
          />
          {canManageTemplates && <Button onClick={() => setAdding(true)}>إضافة نموذج</Button>}
        </div>
      </div>

      {loadError ? (
        <EmptyState>
          تعذر تحميل النماذج. <Button variant="ghost" size="sm" onClick={load}>إعادة المحاولة</Button>
        </EmptyState>
      ) : !templates ? (
        <EmptyState>جارٍ تحميل النماذج...</EmptyState>
      ) : !visible.length ? (
        <EmptyState>
          {templates.length ? 'لا توجد نماذج مطابقة للبحث' : 'لا توجد نماذج متاحة لك حاليًا'}
          {templates.length > 0 && (
            <>
              {' '}
              <Button variant="ghost" size="sm" onClick={() => setQuery('')}>عرض جميع النماذج</Button>
            </>
          )}
        </EmptyState>
      ) : (
        <div className="forms-grid">
          {visible.map((t) => {
            const icon = FORM_ICONS[t.icon || t.definition?.icon || 'custom'] || FORM_ICONS.custom;
            return (
              <a key={t.template_key} className="forms-card" href={`/forms/edit?form=${encodeURIComponent(t.template_key)}`}>
                <span className="forms-card__icon" aria-hidden dangerouslySetInnerHTML={{ __html: icon }} />
                <span className="forms-card__name">{t.name}</span>
                {t.category && <span className="forms-card__cat">{t.category}</span>}
              </a>
            );
          })}
        </div>
      )}

      {canManageTemplates && (
        <AddTemplateModal
          open={adding}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            toast.show('تم إضافة النموذج');
            await load();
          }}
          onError={(message) => toast.show(message)}
        />
      )}
      {toast.node}
    </div>
  );
}

function AddTemplateModal({
  open,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0][0]);
  const [section, setSection] = useState('بيانات النموذج');
  const [fields, setFields] = useState<BuilderField[]>(defaultFields);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName('');
    setCategory(CATEGORIES[0][0]);
    setSection('بيانات النموذج');
    setFields(defaultFields());
  }

  function updateField(index: number, patch: Partial<BuilderField>) {
    setFields((current) => current.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function save() {
    if (!name.trim()) {
      onError('يرجى إدخال اسم النموذج');
      return;
    }
    const builtFields = (fields.length ? fields : defaultFields()).map((f, index) => ({
      type: f.type,
      label: f.label.trim() || `حقل ${index + 1}`,
      id: f.id.trim().replace(/[^a-zA-Z0-9_]/g, '_') || `field_${index + 1}`,
      req: f.req,
      employee_binding: f.binding || undefined,
    }));
    const key = `custom_${Date.now()}`;
    const definition = {
      id: key,
      name: name.trim(),
      cat: category,
      icon: 'custom',
      desc: 'نموذج مخصص',
      sections: [{ title: section.trim() || 'بيانات النموذج', fields: builtFields }],
    };
    setSaving(true);
    try {
      await formsApi('/api/app/forms', {
        method: 'PUT',
        body: JSON.stringify({
          template_key: key,
          name: definition.name,
          category,
          icon: 'custom',
          description: definition.desc,
          definition,
        }),
      });
      reset();
      onSaved();
    } catch {
      onError('تعذر حفظ النموذج في قاعدة البيانات');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إضافة نموذج جديد"
      titleId="forms-add-title"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>إغلاق</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إضافة النموذج'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12, width: 'min(592px, calc(100vw - 80px))' }}>
        <Field id="nf-name" label="اسم النموذج">
          <Input id="nf-name" placeholder="مثال: نموذج تفويض صلاحيات" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field id="nf-cat" label="التصنيف">
            <Select id="nf-cat" value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field id="nf-section" label="عنوان القسم">
            <Input id="nf-section" value={section} onChange={(event) => setSection(event.target.value)} />
          </Field>
        </div>

        <div className="forms-page__toolbar">
          <b style={{ fontSize: 13, fontWeight: 600 }}>حقول النموذج</b>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFields((current) => [...current, { label: '', id: `field_${current.length + 1}`, type: 'text', req: false, binding: '' }])}
          >
            إضافة حقل
          </Button>
        </div>

        {fields.map((field, index) => (
          <div key={index} className="forms-builder-row">
            <Input aria-label="اسم الحقل" placeholder="اسم الحقل" value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} />
            <Input aria-label="مفتاح الحقل" placeholder="field_key" dir="ltr" value={field.id} onChange={(event) => updateField(index, { id: event.target.value })} />
            <Select aria-label="نوع الحقل" value={field.type} onChange={(event) => updateField(index, { type: event.target.value })}>
              {FIELD_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap', fontSize: 12 }}>
              <label>
                <input type="checkbox" checked={field.req} onChange={(event) => updateField(index, { req: event.target.checked })} /> إلزامي
              </label>
              <Button variant="ghost" size="sm" onClick={() => setFields((current) => current.filter((_, i) => i !== index))}>حذف</Button>
            </span>
            <Select
              aria-label="الربط التلقائي"
              className="forms-builder-row__binding"
              value={field.binding}
              onChange={(event) => updateField(index, { binding: event.target.value })}
            >
              {BINDINGS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </Modal>
  );
}
