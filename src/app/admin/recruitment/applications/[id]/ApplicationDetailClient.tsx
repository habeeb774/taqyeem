"use client";
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RecruitmentTopbar } from '@/components/recruitment/RecruitmentTopbar';
import { Button, Card, Input, Select } from '@/components/ui';

const STATUSES: Record<string, string> = {
  new: 'جديد', reviewing: 'قيد المراجعة', shortlisted: 'قائمة مختصرة', interview: 'مقابلة',
  second_interview: 'مقابلة ثانية', offer: 'عرض عمل', hired: 'مقبول', rejected: 'مرفوض',
  withdrawn: 'منسحب', archived: 'مؤرشف',
};

export default function ApplicationDetailClient() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/app/applications/${params.id}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || 'تعذر تحميل الطلب');
      setData(json);
      setStatus(json.application.status);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus() {
    setSaving(true);
    try {
      const res = await fetch(`/api/app/applications/${params.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note || null }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || 'تعذر تحديث الحالة');
      setNote('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/app/applications/${params.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || 'تعذر إضافة الملاحظة');
      setNewNote('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: 'var(--dst-color-bg-page)', color: 'var(--dst-color-text)', fontFamily: 'var(--app-font)' }}>
      <RecruitmentTopbar pageTitle="تفاصيل الطلب" active="applications" maxWidth={900} />

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '28px 34px 60px' }}>
        {loading ? (
          <p style={{ color: 'var(--dst-color-text-muted)' }}>جارٍ التحميل...</p>
        ) : error && !data ? (
          <p style={{ color: 'var(--dst-color-danger)' }}>{error}</p>
        ) : data ? (
          <>
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500 }}>{data.application.full_name}</h2>
                  <p style={{ margin: 0, color: 'var(--dst-color-text-muted)', fontSize: 12, fontWeight: 400 }}>
                    {data.application.reference_number} · {data.application.job_title || 'بدون وظيفة'} · {data.application.department_name || '—'}
                  </p>
                </div>
                <a href={`/api/app/applications/${params.id}/cv`} target="_blank" rel="noreferrer" className="dst-btn dst-btn--ghost dst-btn--md">
                  عرض السيرة الذاتية
                </a>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 18, fontSize: 13 }}>
                <Info label="البريد الإلكتروني" value={data.application.email} />
                <Info label="الجوال" value={data.application.phone} />
                <Info label="المدينة" value={data.application.city || '—'} />
                <Info label="سنوات الخبرة" value={data.application.years_experience ?? '—'} />
                <Info label="لينكدإن" value={data.application.linkedin_url || '—'} />
                <Info label="تاريخ التقديم" value={new Date(data.application.created_at).toLocaleString('ar-SA')} />
              </div>
              {data.application.cover_letter && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--dst-color-text-muted)' }}>خطاب التقديم</p>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{data.application.cover_letter}</p>
                </div>
              )}
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>تغيير الحالة</h3>
              {error && <p style={{ color: 'var(--dst-color-danger)', fontSize: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="اختيار الحالة الجديدة">
                  {Object.entries(STATUSES).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
                <Input
                  placeholder="ملاحظة اختيارية عن سبب التغيير"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ flex: 1, minWidth: 200 }}
                  aria-label="ملاحظة تغيير الحالة"
                />
                <Button onClick={updateStatus} disabled={saving || status === data.application.status}>
                  تحديث الحالة
                </Button>
              </div>
            </Card>

            <Card style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>سجل الحالات</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.history.map((h: any) => (
                  <div key={h.id} style={{ fontSize: 12, color: '#555', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--dst-color-border)', paddingBottom: 8 }}>
                    <span>
                      {STATUSES[h.old_status] || h.old_status || 'بداية'} ← {STATUSES[h.new_status] || h.new_status}
                      {h.note ? ` — ${h.note}` : ''}
                    </span>
                    <span style={{ color: '#aaa', fontWeight: 400, whiteSpace: 'nowrap' }}>
                      {h.changed_by_name || '—'} · {new Date(h.created_at).toLocaleString('ar-SA')}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>الملاحظات الداخلية</h3>
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {data.notes.length === 0 && <p style={{ fontSize: 12, color: 'var(--dst-color-text-muted)', fontWeight: 400 }}>لا توجد ملاحظات بعد.</p>}
                {data.notes.map((n: any) => (
                  <div key={n.id} style={{ fontSize: 13, borderBottom: '1px solid var(--dst-color-border)', paddingBottom: 8 }}>
                    <p style={{ margin: '0 0 4px', whiteSpace: 'pre-wrap' }}>{n.note}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#aaa', fontWeight: 400 }}>{n.user_name} · {new Date(n.created_at).toLocaleString('ar-SA')}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  placeholder="أضف ملاحظة..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{ flex: 1 }}
                  aria-label="ملاحظة جديدة"
                />
                <Button variant="ghost" onClick={addNote} disabled={saving || !newNote.trim()}>
                  إضافة
                </Button>
              </div>
            </Card>
          </>
        ) : null}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin: '0 0 3px', fontSize: 11, color: 'var(--dst-color-text-muted)', fontWeight: 400 }}>{label}</p>
      <p style={{ margin: 0, fontWeight: 500 }}>{value}</p>
    </div>
  );
}
