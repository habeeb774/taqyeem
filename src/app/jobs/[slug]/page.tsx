import { notFound } from 'next/navigation';
import { getPublishedJobBySlug } from '@/server/recruitment/jobs';

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

function section(title: string, content: string | null) {
  if (!content) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 8px' }}>{title}</h2>
      <p style={{ margin: 0, color: '#333', fontSize: 14, lineHeight: 2, whiteSpace: 'pre-wrap' }}>{content}</p>
    </div>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getPublishedJobBySlug(slug);
  if (!job) notFound();

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <header style={{ background: '#173BD1', color: '#fff', padding: '28px 24px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <a href="/jobs" style={{ color: 'rgba(255,255,255,.8)', fontSize: 13, textDecoration: 'none' }}>
            ← كل الوظائف
          </a>
          <h1 style={{ margin: '12px 0 8px', fontSize: 24, fontWeight: 500 }}>{job.title_ar}</h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, opacity: 0.9 }}>
            {job.department_name && <span>{job.department_name}</span>}
            {job.branch_city && <span>· {job.branch_city}</span>}
            <span>· {employmentLabels[job.employment_type] || job.employment_type}</span>
            <span>· {workplaceLabels[job.workplace_type] || job.workplace_type}</span>
            {(job.experience_min || job.experience_max) && (
              <span>
                · الخبرة: {job.experience_min ?? 0}
                {job.experience_max ? `-${job.experience_max}` : '+'} سنوات
              </span>
            )}
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px 80px' }}>
        {job.salary_visible && (job.salary_min || job.salary_max) && (
          <p style={{ color: '#0f766e', fontSize: 14, margin: '0 0 12px' }}>
            الراتب: {job.salary_min ?? '—'} - {job.salary_max ?? '—'} ريال
          </p>
        )}
        {section('الوصف الوظيفي', job.description)}
        {section('المهام والمسؤوليات', job.responsibilities)}
        {section('المتطلبات', job.requirements)}
        {section('المزايا', job.benefits)}

        <p style={{ marginTop: 28, fontSize: 12, color: '#888' }}>
          تاريخ النشر: {new Date(job.publish_at || job.created_at).toLocaleDateString('ar-SA')}
          {job.expires_at && <> · آخر موعد للتقديم: {new Date(job.expires_at).toLocaleDateString('ar-SA')}</>}
        </p>

        <a
          href={job.external_apply_url || `/jobs/${job.slug}/apply`}
          target={job.external_apply_url ? '_blank' : undefined}
          rel={job.external_apply_url ? 'noopener noreferrer' : undefined}
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 24,
            height: 50,
            lineHeight: '50px',
            color: '#fff',
            background: '#173BD1',
            borderRadius: 13,
            fontSize: 15,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          {job.external_apply_url ? 'الاطلاع على الشاغر' : 'التقديم على الوظيفة'}
        </a>
      </section>
    </main>
  );
}
