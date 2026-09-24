"use client";
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <header style={{ background: '#173BD1', color: '#fff', padding: '24px 34px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 13, opacity: 0.8 }}>لوحة التوظيف</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>تفاصيل الطلب</h1>
          </div>
          <Link href="/admin/recruitment/applications" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, textDecoration: 'none' }}>رجوع للمتقدمين</Link>
        </div>
      </header>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '28px 34px 60px' }}>
        {loading ? (
          <p style={{ color: '#888' }}>جارٍ التحميل...</p>
        ) : error && !data ? (
          <p style={{ color: '#d14343' }}>{error}</p>
        ) : data ? (
          <>
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 500 }}>{data.application.full_name}</h2>
                  <p style={{ margin: 0, color: '#888', fontSize: 12, fontWeight: 400 }}>
                    {data.application.reference_number} · {data.application.job_title || 'بدون وظيفة'} · {data.application.department_name || '—'}
                  </p>
                </div>
                <a href={`/api/app/applications/${params.id}/cv`} target="_blank" rel="noreferrer"
                  style={{ border: '1px solid #e0e0e0', background: '#fff', borderRadius: 10, padding: '9px 16px', fontSize: 13, textDecoration: 'none', color: '#0d0d0d' }}>
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
                  <p style={{ margin: '0 0 6px', fontSize: 11, color: '#888' }}>خطاب التقديم</p>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{data.application.cover_letter}</p>
                </div>
              )}
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>تغيير الحالة</h3>
              {error && <p style={{ color: '#d14343', fontSize: 12 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: '9px 12px', fontSize: 13 }}>
                  {Object.entries(STATUSES).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <input
                  placeholder="ملاحظة اختيارية عن سبب التغيير"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ flex: 1, minWidth: 200, border: '1px solid #e0e0e0', borderRadius: 10, padding: '9px 12px', fontSize: 13 }}
                />
                <button onClick={updateStatus} disabled={saving || status === data.application.status}
                  style={{ border: 0, borderRadius: 10, padding: '9px 18px', background: '#173BD1', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  تحديث الحالة
                </button>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>سجل الحالات</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.history.map((h: any) => (
                  <div key={h.id} style={{ fontSize: 12, color: '#555', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
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
            </div>

            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>الملاحظات الداخلية</h3>
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {data.notes.length === 0 && <p style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>لا توجد ملاحظات بعد.</p>}
                {data.notes.map((n: any) => (
                  <div key={n.id} style={{ fontSize: 13, borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <p style={{ margin: '0 0 4px', whiteSpace: 'pre-wrap' }}>{n.note}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#aaa', fontWeight: 400 }}>{n.user_name} · {new Date(n.created_at).toLocaleString('ar-SA')}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="أضف ملاحظة..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 10, padding: '9px 12px', fontSize: 13 }}
                />
                <button onClick={addNote} disabled={saving || !newNote.trim()}
                  style={{ border: '1px solid #e0e0e0', background: '#fff', borderRadius: 10, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>
                  إضافة
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p style={{ margin: '0 0 3px', fontSize: 11, color: '#888', fontWeight: 400 }}>{label}</p>
      <p style={{ margin: 0, fontWeight: 500 }}>{value}</p>
    </div>
  );
}
