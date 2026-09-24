"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RecruitmentTopbar } from '@/components/recruitment/RecruitmentTopbar';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';

type Job = {
  id: string; title_ar: string; title_en: string | null; slug: string; status: string;
  employment_type: string; workplace_type: string; department_name: string | null; branch_name: string | null;
  vacancies_count: number; applications_count: number; created_at: string;
};

type Meta = { departments: { id: string; name: string }[]; branches: { id: string; name: string; city: string | null }[] };

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'دوام كامل' },
  { value: 'part_time', label: 'دوام جزئي' },
  { value: 'contract', label: 'عقد' },
  { value: 'temporary', label: 'مؤقت' },
];
const WORKPLACE_TYPES = [
  { value: 'onsite', label: 'حضوري' },
  { value: 'remote', label: 'عن بعد' },
  { value: 'hybrid', label: 'هجين' },
];
const STATUSES: Record<string, string> = {
  draft: 'مسودة', scheduled: 'مجدولة', published: 'منشورة', paused: 'متوقفة', closed: 'مغلقة', archived: 'مؤرشفة',
};

const emptyForm = {
  title_ar: '', title_en: '', slug: '', department_id: '', branch_id: '',
  employment_type: 'full_time', workplace_type: 'onsite', experience_min: '', experience_max: '',
  description: '', responsibilities: '', requirements: '', benefits: '',
  salary_min: '', salary_max: '', salary_visible: false, vacancies_count: '1',
  external_apply_url: '',
};

export default function JobsClient() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [meta, setMeta] = useState<Meta>({ departments: [], branches: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ q: search, status });
      const res = await fetch(`/api/app/recruitment/jobs?${params}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'تعذر تحميل الوظائف');
      setJobs(data.jobs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    fetch('/api/app/recruitment/meta').then((r) => r.json()).then((d) => {
      if (d.ok) setMeta({ departments: d.departments, branches: d.branches });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setEditing(null);
    setFormError('');
    setShowForm(true);
  }

  async function openEdit(id: string) {
    setFormError('');
    const res = await fetch(`/api/app/recruitment/jobs/${id}`);
    const data = await res.json();
    if (!data.ok) return;
    const j = data.job;
    setForm({
      title_ar: j.title_ar || '', title_en: j.title_en || '', slug: j.slug || '',
      department_id: j.department_id || '', branch_id: j.branch_id || '',
      employment_type: j.employment_type, workplace_type: j.workplace_type,
      experience_min: j.experience_min ?? '', experience_max: j.experience_max ?? '',
      description: j.description || '', responsibilities: j.responsibilities || '',
      requirements: j.requirements || '', benefits: j.benefits || '',
      salary_min: j.salary_min ?? '', salary_max: j.salary_max ?? '',
      salary_visible: !!j.salary_visible, vacancies_count: String(j.vacancies_count ?? 1),
      external_apply_url: j.external_apply_url || '',
    });
    setEditing(id);
    setShowForm(true);
  }

  async function submitForm() {
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        title_ar: form.title_ar, title_en: form.title_en || null, slug: form.slug || form.title_ar,
        department_id: form.department_id || null, branch_id: form.branch_id || null,
        employment_type: form.employment_type, workplace_type: form.workplace_type,
        experience_min: form.experience_min === '' ? null : Number(form.experience_min),
        experience_max: form.experience_max === '' ? null : Number(form.experience_max),
        description: form.description || null, responsibilities: form.responsibilities || null,
        requirements: form.requirements || null, benefits: form.benefits || null,
        salary_min: form.salary_min === '' ? null : Number(form.salary_min),
        salary_max: form.salary_max === '' ? null : Number(form.salary_max),
        salary_visible: form.salary_visible, vacancies_count: Number(form.vacancies_count || 1),
        external_apply_url: form.external_apply_url.trim() || null,
      };
      const res = await fetch(editing ? `/api/app/recruitment/jobs/${editing}` : '/api/app/recruitment/jobs', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message || 'تعذر الحفظ');
      setShowForm(false);
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, newStatus: string) {
    const res = await fetch(`/api/app/recruitment/jobs/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.ok) load();
  }

  async function duplicate(id: string) {
    const res = await fetch(`/api/app/recruitment/jobs/${id}/duplicate`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) load();
  }

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: 'var(--dst-color-bg-page)', color: 'var(--dst-color-text)', fontFamily: 'var(--app-font)' }}>
      <RecruitmentTopbar pageTitle="الوظائف" active="jobs" maxWidth={1200} />

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 34px 60px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            placeholder="بحث بعنوان الوظيفة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
            aria-label="بحث بعنوان الوظيفة"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="فلترة حسب الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(STATUSES).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Button onClick={openCreate}>+ وظيفة جديدة</Button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--dst-color-text-muted)' }}>جارٍ التحميل...</p>
        ) : error ? (
          <p style={{ color: 'var(--dst-color-danger)' }}>{error}</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: 'var(--dst-color-text-muted)' }}>لا توجد وظائف بعد.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {jobs.map((job) => (
              <div key={job.id} className="dst-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 16, borderRadius: 14 }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: 15 }}>{job.title_ar}</p>
                  <p style={{ margin: 0, color: 'var(--dst-color-text-muted)', fontSize: 12, fontWeight: 400 }}>
                    {job.department_name || '—'} · {job.branch_name || '—'} ·{' '}
                    {EMPLOYMENT_TYPES.find((t) => t.value === job.employment_type)?.label} ·{' '}
                    {WORKPLACE_TYPES.find((t) => t.value === job.workplace_type)?.label} · {job.applications_count} متقدم
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge>{STATUSES[job.status]}</Badge>
                  <Select value={job.status} onChange={(e) => changeStatus(job.id, e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '6px 8px' }} aria-label={`تغيير حالة ${job.title_ar}`}>
                    {Object.entries(STATUSES).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(job.id)}>تعديل</Button>
                  <Button variant="ghost" size="sm" onClick={() => duplicate(job.id)}>نسخ</Button>
                  <Link href={`/admin/recruitment/applications?job_id=${job.id}`} className="dst-btn dst-btn--ghost dst-btn--sm">
                    المتقدمون
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        titleId="job-form-title"
        title={editing ? 'تعديل وظيفة' : 'وظيفة جديدة'}
        actions={
          <>
            <Button onClick={submitForm} disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>إلغاء</Button>
          </>
        }
      >
        {formError && <p style={{ color: 'var(--dst-color-danger)', fontSize: 12 }}>{formError}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field id="job-title-ar" label="المسمى الوظيفي (عربي)" full>
            <Input id="job-title-ar" value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} />
          </Field>
          <Field id="job-title-en" label="المسمى الوظيفي (إنجليزي)">
            <Input id="job-title-en" value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} />
          </Field>
          <Field id="job-slug" label="الرابط (slug)">
            <Input id="job-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </Field>
          <Field id="job-department" label="القسم">
            <Select id="job-department" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
              <option value="">—</option>
              {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field id="job-branch" label="الفرع">
            <Select id="job-branch" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">—</option>
              {meta.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field id="job-employment-type" label="نوع الدوام">
            <Select id="job-employment-type" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field id="job-workplace-type" label="مكان العمل">
            <Select id="job-workplace-type" value={form.workplace_type} onChange={(e) => setForm({ ...form, workplace_type: e.target.value })}>
              {WORKPLACE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field id="job-experience-min" label="الحد الأدنى للخبرة (سنوات)">
            <Input id="job-experience-min" type="number" value={form.experience_min} onChange={(e) => setForm({ ...form, experience_min: e.target.value })} />
          </Field>
          <Field id="job-experience-max" label="الحد الأقصى للخبرة (سنوات)">
            <Input id="job-experience-max" type="number" value={form.experience_max} onChange={(e) => setForm({ ...form, experience_max: e.target.value })} />
          </Field>
          <Field id="job-vacancies" label="عدد الشواغر">
            <Input id="job-vacancies" type="number" value={form.vacancies_count} onChange={(e) => setForm({ ...form, vacancies_count: e.target.value })} />
          </Field>
          <Field id="job-salary-min" label="الحد الأدنى للراتب">
            <Input id="job-salary-min" type="number" value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} />
          </Field>
          <Field id="job-salary-max" label="الحد الأقصى للراتب">
            <Input id="job-salary-max" type="number" value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input id="job-salary-visible" type="checkbox" checked={form.salary_visible} onChange={(e) => setForm({ ...form, salary_visible: e.target.checked })} />
            <label htmlFor="job-salary-visible">إظهار الراتب للمتقدمين</label>
          </div>
          <Field id="job-external-apply-url" label="رابط تقديم خارجي (اختياري — مثل تمهير)" hint="إذا تم تعبئته، سيتم توجيه المتقدمين لهذا الرابط بدل نموذج التقديم الداخلي." full>
            <Input
              id="job-external-apply-url"
              placeholder="https://..."
              value={form.external_apply_url}
              onChange={(e) => setForm({ ...form, external_apply_url: e.target.value })}
            />
          </Field>
          <Field id="job-description" label="الوصف" full>
            <Textarea id="job-description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field id="job-responsibilities" label="المسؤوليات" full>
            <Textarea id="job-responsibilities" rows={3} value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} />
          </Field>
          <Field id="job-requirements" label="المتطلبات" full>
            <Textarea id="job-requirements" rows={3} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
          </Field>
          <Field id="job-benefits" label="المزايا" full>
            <Textarea id="job-benefits" rows={3} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </main>
  );
}
