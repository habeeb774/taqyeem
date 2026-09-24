"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

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
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <header style={{ background: '#173BD1', color: '#fff', padding: '24px 34px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 13, opacity: 0.8 }}>لوحة التوظيف</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>الوظائف</h1>
          </div>
          <nav style={{ display: 'flex', gap: 10 }}>
            <Link href="/admin/recruitment" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, textDecoration: 'none' }}>نظرة عامة</Link>
            <Link href="/admin/recruitment/applications" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, textDecoration: 'none' }}>المتقدمون</Link>
          </nav>
        </div>
      </header>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 34px 60px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="بحث بعنوان الوظيفة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, border: '1px solid #e0e0e0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            <option value="">كل الحالات</option>
            {Object.entries(STATUSES).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button
            onClick={openCreate}
            style={{ border: 0, borderRadius: 10, padding: '10px 18px', background: '#173BD1', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            + وظيفة جديدة
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>جارٍ التحميل...</p>
        ) : error ? (
          <p style={{ color: '#d14343' }}>{error}</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: '#888' }}>لا توجد وظائف بعد.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {jobs.map((job) => (
              <div
                key={job.id}
                style={{
                  background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: 16, display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}
              >
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: 15 }}>{job.title_ar}</p>
                  <p style={{ margin: 0, color: '#888', fontSize: 12, fontWeight: 400 }}>
                    {job.department_name || '—'} · {job.branch_name || '—'} ·{' '}
                    {EMPLOYMENT_TYPES.find((t) => t.value === job.employment_type)?.label} ·{' '}
                    {WORKPLACE_TYPES.find((t) => t.value === job.workplace_type)?.label} · {job.applications_count} متقدم
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: '#eef2ff', color: '#173BD1', fontWeight: 500 }}>{STATUSES[job.status]}</span>
                  <select value={job.status} onChange={(e) => changeStatus(job.id, e.target.value)} style={{ fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 8, padding: '6px 8px' }}>
                    {Object.entries(STATUSES).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <button onClick={() => openEdit(job.id)} style={{ border: '1px solid #e0e0e0', background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>تعديل</button>
                  <button onClick={() => duplicate(job.id)} style={{ border: '1px solid #e0e0e0', background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>نسخ</button>
                  <Link
                    href={`/admin/recruitment/applications?job_id=${job.id}`}
                    style={{
                      border: '1px solid #e0e0e0', background: '#fff', borderRadius: 8, padding: '6px 10px',
                      fontSize: 12, textDecoration: 'none', color: '#0d0d0d',
                    }}
                  >
                    المتقدمون
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: '#11182788', zIndex: 100, display: 'grid', placeItems: 'center', padding: 18 }}>
          <div style={{ width: 'min(640px,100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 500 }}>{editing ? 'تعديل وظيفة' : 'وظيفة جديدة'}</h2>
            {formError && <p style={{ color: '#d14343', fontSize: 12 }}>{formError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="المسمى الوظيفي (عربي)" full>
                <input value={form.title_ar} onChange={(e) => setForm({ ...form, title_ar: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="المسمى الوظيفي (إنجليزي)">
                <input value={form.title_en} onChange={(e) => setForm({ ...form, title_en: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="الرابط (slug)">
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="القسم">
                <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="الفرع">
                <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  {meta.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="نوع الدوام">
                <select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} style={inputStyle}>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="مكان العمل">
                <select value={form.workplace_type} onChange={(e) => setForm({ ...form, workplace_type: e.target.value })} style={inputStyle}>
                  {WORKPLACE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="الحد الأدنى للخبرة (سنوات)">
                <input type="number" value={form.experience_min} onChange={(e) => setForm({ ...form, experience_min: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="الحد الأقصى للخبرة (سنوات)">
                <input type="number" value={form.experience_max} onChange={(e) => setForm({ ...form, experience_max: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="عدد الشواغر">
                <input type="number" value={form.vacancies_count} onChange={(e) => setForm({ ...form, vacancies_count: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="الحد الأدنى للراتب">
                <input type="number" value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="الحد الأقصى للراتب">
                <input type="number" value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={form.salary_visible} onChange={(e) => setForm({ ...form, salary_visible: e.target.checked })} />
                  إظهار الراتب للمتقدمين
                </label>
              </Field>
              <Field label="الوصف" full>
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="المسؤوليات" full>
                <textarea rows={3} value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="المتطلبات" full>
                <textarea rows={3} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="المزايا" full>
                <textarea rows={3} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} style={inputStyle} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={submitForm}
                disabled={saving}
                style={{
                  border: 0, borderRadius: 10, padding: '10px 20px', background: '#173BD1', color: '#fff',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setShowForm(false)} style={{ border: '1px solid #e0e0e0', background: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13, cursor: 'pointer' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e0e0e0', borderRadius: 10, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit' };

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? '1/-1' : undefined, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>{label}</label>}
      {children}
    </div>
  );
}
