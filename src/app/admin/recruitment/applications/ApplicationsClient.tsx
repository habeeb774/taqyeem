"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RecruitmentTopbar } from '@/components/recruitment/RecruitmentTopbar';
import { Badge, Input, Select } from '@/components/ui';

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
    <main dir="rtl" style={{ minHeight: '100vh', background: 'var(--dst-color-bg-page)', color: 'var(--dst-color-text)', fontFamily: 'var(--app-font)' }}>
      <RecruitmentTopbar pageTitle="المتقدمون" active="applications" maxWidth={1200} />

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 34px 60px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          <Input
            placeholder="بحث بالاسم، البريد، الجوال، أو رقم الطلب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240 }}
            aria-label="بحث عن متقدم"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="فلترة حسب الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(STATUSES).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </div>

        {loading ? (
          <p style={{ color: 'var(--dst-color-text-muted)' }}>جارٍ التحميل...</p>
        ) : error ? (
          <p style={{ color: 'var(--dst-color-danger)' }}>{error}</p>
        ) : applications.length === 0 ? (
          <p style={{ color: 'var(--dst-color-text-muted)' }}>لا يوجد متقدمون بعد.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {applications.map((app) => (
              <Link
                key={app.id}
                href={`/admin/recruitment/applications/${app.id}`}
                className="dst-card"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  textDecoration: 'none', color: 'inherit', padding: 16, borderRadius: 14,
                }}
              >
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 500, fontSize: 15 }}>{app.full_name}</p>
                  <p style={{ margin: 0, color: 'var(--dst-color-text-muted)', fontSize: 12, fontWeight: 400 }}>
                    {app.reference_number} · {app.job_title || 'بدون وظيفة'} · {app.email} · {app.phone}
                  </p>
                </div>
                <Badge>{STATUSES[app.status] || app.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
