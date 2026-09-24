"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Application = {
  id: string; reference_number: string; full_name: string; email: string; phone: string;
  city: string | null; years_experience: number | null; status: string; created_at: string;
  job_title: string | null; department_name: string | null;
};

const STATUSES: Record<string, string> = {
  new: 'جديد', reviewing: 'قيد المراجعة', shortlisted: 'قائمة مختصرة', interview: 'مقابلة',
  second_interview: 'مقابلة ثانية', offer: 'عرض عمل', hired: 'مقبول', rejected: 'مرفوض',
  withdrawn: 'منسحب', archived: 'مؤرشف',
};

export default function ApplicationsClient() {
  const searchParams = useSearchParams();
  const jobIdFilter = searchParams.get('job_id') || '';
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ q: search, status });
    if (jobIdFilter) params.set('job_id', jobIdFilter);
    fetch(`/api/app/applications?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error?.message || 'تعذر تحميل المتقدمين');
        setApplications(data.applications);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, status, jobIdFilter]);

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <header style={{ background: '#173BD1', color: '#fff', padding: '24px 34px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 13, opacity: 0.8 }}>لوحة التوظيف</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>المتقدمون</h1>
          </div>
          <nav style={{ display: 'flex', gap: 10 }}>
            <Link href="/admin/recruitment" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, textDecoration: 'none' }}>نظرة عامة</Link>
            <Link href="/admin/recruitment/jobs" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, textDecoration: 'none' }}>الوظائف</Link>
          </nav>
        </div>
      </header>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 34px 60px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <input
            placeholder="بحث بالاسم، البريد، الجوال، أو رقم الطلب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, border: '1px solid #e0e0e0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            <option value="">كل الحالات</option>
            {Object.entries(STATUSES).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>جارٍ التحميل...</p>
        ) : error ? (
          <p style={{ color: '#d14343' }}>{error}</p>
        ) : applications.length === 0 ? (
          <p style={{ color: '#888' }}>لا يوجد متقدمون بعد.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {applications.map((app) => (
              <Link
                key={app.id}
                href={`/admin/recruitment/applications/${app.id}`}
                style={{
                  background: '#fff', border: '1px solid #e0e0e0', borderRadius: 14, padding: 16, display: 'flex',
                  justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: 15 }}>{app.full_name}</p>
                  <p style={{ margin: 0, color: '#888', fontSize: 12, fontWeight: 400 }}>
                    {app.reference_number} · {app.job_title || 'بدون وظيفة'} · {app.email} · {app.phone}
                  </p>
                </div>
                <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, background: '#eef2ff', color: '#173BD1', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {STATUSES[app.status] || app.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
