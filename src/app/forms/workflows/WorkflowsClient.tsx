'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Field, Input, Select } from '@/components/ui';
import { formsApi, useToast } from '../_shared/client';

type ApproverType = 'employee' | 'direct_manager' | 'department_manager' | 'branch_manager' | 'role' | 'user';

type Step = {
  approver_type: ApproverType;
  approver_role_id: string | null;
  approver_user_id: string | null;
  title: string;
};

type Workflow = {
  id: string;
  template_id: string;
  name: string;
  active: boolean;
  template_name: string;
  steps: (Step & { step_order: number })[];
};

type WorkflowData = {
  workflows: Workflow[];
  templates: { id: string; template_key: string; name: string }[];
  roles: { id: string; code: string; name_ar: string | null }[];
  users: { id: string; name: string | null; email: string }[];
};

const APPROVER_TYPES: [ApproverType, string][] = [
  ['employee', 'الموظف'],
  ['direct_manager', 'المدير المباشر'],
  ['department_manager', 'مدير الإدارة'],
  ['branch_manager', 'مدير الفرع'],
  ['role', 'دور محدد'],
  ['user', 'مستخدم محدد'],
];

const DEFAULT_NAME = 'مسار الموافقة الرئيسي';
const defaultStep = (): Step => ({ approver_type: 'direct_manager', approver_role_id: null, approver_user_id: null, title: 'المدير المباشر' });

export function WorkflowsClient() {
  const toast = useToast();
  const [data, setData] = useState<WorkflowData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState(DEFAULT_NAME);
  const [steps, setSteps] = useState<Step[]>([defaultStep()]);
  const [saving, setSaving] = useState(false);

  const selectTemplate = useCallback((source: WorkflowData, id: string) => {
    setTemplateId(id);
    const current = source.workflows.find((w) => String(w.template_id) === String(id) && w.active);
    setName(current?.name || DEFAULT_NAME);
    setSteps(
      current?.steps.length
        ? current.steps.map((s) => ({
            approver_type: s.approver_type,
            approver_role_id: s.approver_role_id,
            approver_user_id: s.approver_user_id,
            title: s.title || '',
          }))
        : [defaultStep()],
    );
  }, []);

  const load = useCallback(
    async (keepTemplate?: string) => {
      setLoadError(false);
      try {
        const result = await formsApi<WorkflowData>('/api/app/form-workflows');
        setData(result);
        const id = keepTemplate || result.templates[0]?.id || '';
        if (id) selectTemplate(result, id);
      } catch {
        setLoadError(true);
      }
    },
    [selectTemplate],
  );

  useEffect(() => {
    load();
  }, [load]);

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function changeType(index: number, type: ApproverType) {
    updateStep(index, {
      approver_type: type,
      approver_role_id: type === 'role' ? data?.roles[0]?.id || null : null,
      approver_user_id: type === 'user' ? data?.users[0]?.id || null : null,
    });
  }

  async function save() {
    if (!templateId || name.trim().length < 2 || !steps.length) {
      toast.show('اختر نموذجًا وأضف خطوة موافقة واحدة على الأقل');
      return;
    }
    setSaving(true);
    try {
      await formsApi('/api/app/form-workflows', {
        method: 'PUT',
        body: JSON.stringify({
          template_id: templateId,
          name: name.trim(),
          steps: steps.map((s) => ({
            approver_type: s.approver_type,
            approver_role_id: s.approver_type === 'role' ? s.approver_role_id : null,
            approver_user_id: s.approver_type === 'user' ? s.approver_user_id : null,
            title: s.title.trim() || null,
          })),
        }),
      });
      toast.show('تم حفظ مسار الموافقة');
      await load(templateId);
    } catch (error) {
      toast.show(`تعذر حفظ المسار: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="forms-page__body">
        <EmptyState>
          تعذر تحميل إعدادات المسارات. <Button variant="ghost" size="sm" onClick={() => load()}>إعادة المحاولة</Button>
        </EmptyState>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="forms-page__body">
        <EmptyState>جارٍ تحميل المسارات...</EmptyState>
      </div>
    );
  }
  if (!data.templates.length) {
    return (
      <div className="forms-page__body">
        <EmptyState>لا توجد نماذج نشطة لإعداد مسارات لها.</EmptyState>
      </div>
    );
  }

  return (
    <div className="forms-page__body">
      <Card style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Field id="wf-template" label="النموذج">
            <Select id="wf-template" value={templateId} onChange={(event) => selectTemplate(data, event.target.value)}>
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field id="wf-name" label="اسم المسار">
            <Input id="wf-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {steps.map((step, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ color: 'var(--dst-color-primary)', minWidth: 18 }}>{index + 1}</b>
              <Select
                aria-label="نوع المعتمد"
                value={step.approver_type}
                onChange={(event) => changeType(index, event.target.value as ApproverType)}
                style={{ minWidth: 170, flex: '0 1 auto' }}
              >
                {APPROVER_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              {step.approver_type === 'role' && (
                <Select
                  aria-label="الدور"
                  value={step.approver_role_id || ''}
                  onChange={(event) => updateStep(index, { approver_role_id: event.target.value })}
                  style={{ minWidth: 170, flex: '0 1 auto' }}
                >
                  {data.roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name_ar || r.code}</option>
                  ))}
                </Select>
              )}
              {step.approver_type === 'user' && (
                <Select
                  aria-label="المستخدم"
                  value={step.approver_user_id || ''}
                  onChange={(event) => updateStep(index, { approver_user_id: event.target.value })}
                  style={{ minWidth: 170, flex: '0 1 auto' }}
                >
                  {data.users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </Select>
              )}
              <Input
                aria-label="عنوان الخطوة"
                placeholder="عنوان الخطوة"
                value={step.title}
                onChange={(event) => updateStep(index, { title: event.target.value })}
                style={{ flex: '1 1 180px' }}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={steps.length === 1}
                onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
              >
                حذف
              </Button>
            </div>
          ))}
        </div>

        <div className="forms-page__toolbar">
          <Button variant="ghost" onClick={() => setSteps((current) => [...current, defaultStep()])} disabled={steps.length >= 20}>
            إضافة خطوة
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ مسار الموافقة'}
          </Button>
        </div>
      </Card>

      {data.workflows.length > 0 && (
        <Card style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>المسارات الحالية</h2>
          {data.workflows.map((w) => (
            <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
              <b style={{ fontWeight: 500 }}>{w.template_name} — {w.name}</b>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Badge variant={w.active ? 'success' : 'default'}>{w.active ? 'نشط' : 'غير نشط'}</Badge>
                <span style={{ color: 'var(--dst-color-text-muted)' }}>{w.steps.length} خطوات</span>
              </span>
            </div>
          ))}
        </Card>
      )}

      {toast.node}
    </div>
  );
}
