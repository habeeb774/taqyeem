'use client';

import { useEffect, useState } from 'react';

type Job = {
  id: string;
  title_ar: string;
  title_en: string | null;
  slug: string;
  employment_type: string;
  workplace_type: string;
  branch_name: string | null;
  branch_city: string | null;
  department_name: string | null;
  created_at: string;
};

const employmentLabels: Record<string, string> = {
  full_time: 'دوام كامل',
  part_time: 'دوام جزئي',
  contract: 'عقد',
  temporary: 'مؤقت',
};

const workplaceLabels: Record<string, string> = {
  onsite: 'حضوري',
  remote: 'عن بُعد',
  hybrid: 'هجين',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setJobs(null);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('q', search.trim());
        const response = await fetch(`/api/app/jobs?${params.toString()}`, { signal: controller.signal });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'REQUEST_FAILED');
        setJobs(data.jobs);
        setTotal(data.pagination?.total ?? data.jobs.length);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('تعذر تحميل الوظائف حاليًا، حاول مرة أخرى.');
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <header style={{ background: '#173BD1', color: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,.38)',
              background: "rgba(255,255,255,.13) url('/brand-logo.png') center/25px 32px no-repeat",
              filter: 'brightness(0) invert(1)',
              flexShrink: 0,
            }}
            aria-label="شعار السويد"
          />
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>شركة السويد التجارية</p>
            <p style={{ margin: 0, color: 'rgba(255,255,255,.7)', fontSize: 11 }}>التوظيف والفرص الوظيفية</p>
          </div>
        </div>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '10px 24px 36px' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>انضم إلى فريقنا</h1>
          <p style={{ margin: '12px 0 0', fontSize: 14, opacity: 0.9, lineHeight: 1.9, maxWidth: 560 }}>
            نبحث دائمًا عن مواهب تشاركنا الطموح. تصفح الوظائف الشاغرة أدناه وقدّم طلبك مباشرة.
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 13, opacity: 0.85 }}>
            {jobs ? `${total} وظيفة متاحة حاليًا` : 'جاري تحميل الوظائف...'}
          </p>
        </div>
      </header>

      <section style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 60px' }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث عن وظيفة..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: 46,
            borderRadius: 12,
            border: '1px solid #dcdfe6',
            padding: '0 16px',
            fontSize: 14,
            fontFamily: 'var(--app-font)',
            marginBottom: 24,
          }}
        />

        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {jobs === null && !error && (
          <div style={{ display: 'grid', gap: 12 }}>
            {[0, 1, 2].map((index) => (
              <div key={index} style={{ height: 108, borderRadius: 16, background: '#eef1f6' }} />
            ))}
          </div>
        )}

        {jobs !== null && jobs.length === 0 && (
          <p style={{ textAlign: 'center', color: '#64748b', padding: '60px 0' }}>
            لا توجد وظائف شاغرة حاليًا. يمكنك إرسال سيرتك الذاتية بدون وظيفة محددة.
            <br />
            <a href="/careers/general" style={{ color: '#173BD1' }}>
              التقديم العام
            </a>
          </p>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {jobs?.map((job) => (
            <a
              key={job.id}
              href={`/jobs/${job.slug}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: '#0d0d0d',
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: 16,
                padding: '18px 20px',
              }}
            >
              <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 500 }}>{job.title_ar}</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
                {job.department_name && <span>{job.department_name}</span>}
                {job.branch_city && <span>· {job.branch_city}</span>}
                <span>· {employmentLabels[job.employment_type] || job.employment_type}</span>
                <span>· {workplaceLabels[job.workplace_type] || job.workplace_type}</span>
              </div>
            </a>
          ))}
        </div>

        {jobs !== null && jobs.length > 0 && (
          <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13 }}>
            لم تجد شاغرًا يناسب مؤهلاتك؟{' '}
            <a href="/careers/general" style={{ color: '#173BD1' }}>
              أرسل سيرتك الذاتية
            </a>
          </p>
        )}
      </section>
    </main>
  );
}
