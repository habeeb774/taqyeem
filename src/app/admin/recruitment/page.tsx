import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import { getRecruitmentDashboard } from '@/server/recruitment/jobs';
import { RecruitmentTopbar } from '@/components/recruitment/RecruitmentTopbar';

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
      <RecruitmentTopbar pageTitle="نظرة عامة" active="overview" />

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
