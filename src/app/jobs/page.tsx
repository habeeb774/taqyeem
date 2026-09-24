'use client';

import { useEffect, useMemo, useState } from 'react';

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

function norm(value: string) {
  return value.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [city, setCity] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setError(null);
      try {
        const response = await fetch('/api/app/jobs?limit=100', { signal: controller.signal });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'REQUEST_FAILED');
        setJobs(data.jobs);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('تعذر تحميل الوظائف حاليًا، حاول مرة أخرى.');
      }
    })();
    return () => controller.abort();
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    (jobs || []).forEach((job) => job.department_name && set.add(job.department_name));
    return [...set];
  }, [jobs]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    (jobs || []).forEach((job) => job.branch_city && set.add(job.branch_city));
    return [...set];
  }, [jobs]);

  const filtered = useMemo(() => {
    const query = norm(search.trim());
    return (jobs || []).filter((job) => {
      if (dept && job.department_name !== dept) return false;
      if (city && job.branch_city !== city) return false;
      if (query) {
        const haystack = norm(`${job.title_ar} ${job.title_en || ''} ${job.department_name || ''} ${job.branch_city || ''}`);
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [jobs, dept, city, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Job[]>();
    filtered.forEach((job) => {
      const key = job.department_name || 'عام';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(job);
    });
    return [...groups.entries()];
  }, [filtered]);

  function copyLink(job: Job) {
    const url = `${window.location.origin}/jobs/${job.slug}`;
    const done = () => {
      setCopiedId(job.id);
      setTimeout(() => setCopiedId((current) => (current === job.id ? null : current)), 2200);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, done);
    } else {
      done();
    }
  }

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <header style={{ background: '#173BD1', color: '#fff' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,.38)',
              background: "rgba(255,255,255,.13) url('/brand-logo.png') center/25px 32px no-repeat",
              filter: 'brightness(0) invert(1)', flexShrink: 0,
            }}
            aria-label="شعار السويد"
          />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>شركة السويد التجارية</p>
            <a href="#" style={{ margin: 0, color: 'rgba(255,255,255,.7)', fontSize: 11, textDecoration: 'none' }}>
              ← العودة لمتجر السويد
            </a>
          </div>
          <a href="/login" style={{ color: 'rgba(255,255,255,.8)', fontSize: 12.5, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            دخول الموظفين
          </a>
        </div>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '10px 24px 36px' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500 }}>وظائف السويد</h1>
          <p style={{ margin: '14px 0 0', fontSize: 13, opacity: 0.85 }}>
            {jobs ? `${filtered.length} وظيفة متاحة حاليًا` : 'جارٍ تحميل الوظائف...'}
          </p>
        </div>
      </header>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 8px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 10px' }}>تعريف الشركة</h2>
        <p style={{ color: '#333', fontSize: 14, lineHeight: 2, margin: '0 0 16px' }}>
          تُعدّ شركة إبراهيم عبدالله السويد التجارية إحدى الشركات السعودية الرائدة في توريد مستلزمات السباكة والأدوات
          الصحية ومواد البناء والكهرباء، وتخدم المشاريع السكنية والتجارية والصناعية في مختلف مناطق المملكة العربية
          السعودية، من مرحلة التأسيس حتى التشطيب النهائي.
        </p>
        <p style={{ color: '#333', fontSize: 14, lineHeight: 2, margin: '0 0 16px' }}>
          وقد تأسّست الشركة عام 1978م، ورسّخت خلال أكثر من خمسة وأربعين عامًا مكانتها مزوّدًا موثوقًا في القطاع،
          اعتمادًا على شبكة شراكات مع عدد من العلامات التجارية العالمية، وفريق عمل مؤهّل يضع رضا العملاء في مقدمة
          أولوياته.
        </p>
        <p style={{ color: '#333', fontSize: 14, lineHeight: 2, margin: 0 }}>
          وفي إطار خطط التوسّع التشغيلي، تستقطب الشركة الكفاءات المؤهّلة للانضمام إلى إداراتها الفنية والتشغيلية
          والإدارية، وتوفّر لها بيئة عمل مستقرة ومسارات تطوير مهني واضحة.
        </p>
      </section>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 8px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 14px' }}>المزايا الوظيفية</h2>
        <p style={{ color: '#333', fontSize: 14, lineHeight: 2, margin: '0 0 12px' }}>
          توفّر الشركة حزمة مزايا تنافسية لجميع منسوبيها، ومن أبرزها:
        </p>
        <ul style={{ margin: 0, padding: '0 20px 0 0', color: '#333', fontSize: 14, lineHeight: 2.2 }}>
          <li>تأمين طبي للموظف وأفراد أسرته.</li>
          <li>راتب أساسي تنافسي مع بدلَي السكن والمواصلات.</li>
          <li>برامج تدريب على الأنظمة والمنتجات المعتمدة في الشركة.</li>
          <li>خصم لمنسوبي الشركة على منتجاتها.</li>
          <li>بيئة عمل تعتمد الأنظمة الرقمية في جميع الإجراءات.</li>
        </ul>
      </section>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 0' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>الوظائف الشاغرة</h2>
      </section>

      <section id="jobs" style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 24px 8px' }}>
        {departments.length > 0 && (
          <div style={{ display: 'flex', gap: 18, overflowX: 'auto', borderBottom: '1px solid #e4e6ee', marginBottom: 18 }}>
            <button onClick={() => setDept('')} style={tabStyle(dept === '')}>
              جميع الأقسام
            </button>
            {departments.map((department) => (
              <button key={department} onClick={() => setDept(department)} style={tabStyle(dept === department)}>
                {department}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="البحث عن شواغر"
            style={{ flex: '1 1 260px', minWidth: 220, height: 44, borderRadius: 10, border: '1px solid #dcdfe6', padding: '0 15px', fontSize: 14, fontFamily: 'var(--app-font)' }}
          />
          {cities.length > 0 && (
            <select
              value={city}
              onChange={(event) => setCity(event.target.value)}
              style={{ height: 44, borderRadius: 10, border: '1px solid #dcdfe6', padding: '0 12px', fontSize: 14, fontFamily: 'var(--app-font)' }}
            >
              <option value="">مكان العمل</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {jobs === null && !error && (
          <div style={{ display: 'grid', gap: 12 }}>
            {[0, 1, 2].map((index) => (
              <div key={index} style={{ height: 108, borderRadius: 16, background: '#eef1f6' }} />
            ))}
          </div>
        )}

        {jobs !== null && filtered.length === 0 && (
          <div style={{ border: '1px dashed #e0e0e0', borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
            <b style={{ display: 'block', color: '#0d0d0d', fontWeight: 500, marginBottom: 6 }}>لا توجد وظائف شاغرة مطابقة حاليًا</b>
            يمكنك إرسال سيرتك الذاتية بدون وظيفة محددة عبر{' '}
            <a href="/careers/general" style={{ color: '#173BD1' }}>التقديم العام</a>.
          </div>
        )}

        {grouped.map(([department, departmentJobs]) => (
          <div key={department} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', fontSize: 16, fontWeight: 500 }}>
              {department}
              <span style={{ background: '#f6f7fb', color: '#64748b', borderRadius: 6, fontSize: 12, padding: '2px 9px' }}>{departmentJobs.length}</span>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {departmentJobs.map((job) => (
                <div key={job.id} style={cardStyle}>
                  <div>
                    <a href={`/jobs/${job.slug}`} style={{ fontWeight: 500, fontSize: 16, color: '#0d0d0d', textDecoration: 'none', borderBottom: '2px solid #6CC9CC', paddingBottom: 2 }}>
                      {job.title_ar}{job.title_en ? ` | ${job.title_en}` : ''}
                    </a>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13, color: '#64748b', marginTop: 10 }}>
                      {job.branch_city && <span>{job.branch_city}</span>}
                      <span>{employmentLabels[job.employment_type] || job.employment_type}</span>
                      <span>{workplaceLabels[job.workplace_type] || job.workplace_type}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9, alignSelf: 'flex-start' }}>
                    <a href={`/jobs/${job.slug}`} style={{ textAlign: 'center', background: '#173BD1', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 13, textDecoration: 'none' }}>
                      الاطلاع على الشاغر
                    </a>
                    <button
                      onClick={() => copyLink(job)}
                      style={{
                        border: '1px solid #e0e0e0', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, cursor: 'pointer',
                        background: copiedId === job.id ? '#173BD1' : '#fff',
                        color: copiedId === job.id ? '#fff' : '#64748b',
                      }}
                    >
                      {copiedId === job.id ? '✓ تم نسخ الرابط' : 'نسخ رابط الوظيفة'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section style={{ background: '#173BD1', color: '#fff', marginTop: 20 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 24px' }}>
          <h2 style={{ fontSize: 22, fontWeight: 500, margin: '0 0 12px' }}>لم تجد شاغرًا يناسب مؤهلاتك؟</h2>
          <p style={{ color: 'rgba(255,255,255,.85)', maxWidth: 560, margin: '0 0 20px', lineHeight: 1.9 }}>
            يمكنكم إرسال السيرة الذاتية إلى إدارة الموارد البشرية لحفظها في قاعدة بيانات المتقدمين، وسيتم التواصل معكم
            عند توفّر شاغر مطابق للمؤهلات والخبرات.
          </p>
          <a href="/careers/general" style={{ display: 'inline-block', background: '#fff', color: '#173BD1', borderRadius: 10, padding: '12px 26px', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
            إرسال السيرة الذاتية
          </a>
        </div>
      </section>

      <footer style={{ padding: '24px', textAlign: 'center', color: '#9aa2b1', fontSize: 12 }}>السويد</footer>
    </main>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    background: 'none', border: 0, padding: '10px 2px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
    borderBottom: active ? '2px solid #173BD1' : '2px solid transparent',
    fontWeight: active ? 500 : 400,
    color: active ? '#0d0d0d' : '#64748b',
  };
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0', borderRadius: 10, padding: '20px 22px',
  display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
};
