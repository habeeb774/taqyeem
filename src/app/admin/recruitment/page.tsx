import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import { getRecruitmentDashboard } from '@/server/recruitment/jobs';

const cards = [
  { key: 'active_jobs', label: 'الوظائف النشطة' },
  { key: 'total_applications', label: 'إجمالي المتقدمين' },
  { key: 'today_applications', label: 'طلبات اليوم' },
  { key: 'week_applications', label: 'طلبات هذا الأسبوع' },
  { key: 'month_applications', label: 'طلبات هذا الشهر' },
  { key: 'in_review_applications', label: 'قيد المراجعة' },
  { key: 'hired_applications', label: 'المقبولون' },
  { key: 'rejected_applications', label: 'المرفوضون' },
] as const;

export default async function RecruitmentAdminPage() {
  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    redirect('/login');
  }
  if (!context.permissions.includes('recruitment.jobs.view')) redirect('/');

  const stats = await getRecruitmentDashboard(context);

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <header style={{ background: '#173BD1', color: '#fff', padding: '24px 34px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 13, opacity: 0.8 }}>لوحة التوظيف</p>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>نظرة عامة</h1>
          </div>
          <nav style={{ display: 'flex', gap: 10 }}>
            <a href="/admin/recruitment/jobs" style={{ color: '#fff', fontSize: 13, textDecoration: 'none' }}>
              الوظائف
            </a>
            <a href="/admin/recruitment/applications" style={{ color: '#fff', fontSize: 13, textDecoration: 'none' }}>
              المتقدمون
            </a>
            <a href="/" style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, textDecoration: 'none' }}>
              الصفحة الرئيسية
            </a>
          </nav>
        </div>
      </header>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 34px 60px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          {cards.map((card) => (
            <div key={card.key} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 16, padding: 18 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>{card.label}</p>
              <p style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>{Number(stats?.[card.key] ?? 0)}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
