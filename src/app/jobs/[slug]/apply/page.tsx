import { notFound, redirect } from 'next/navigation';
import { ApplicationForm } from '@/components/recruitment/ApplicationForm';
import { getPublishedJobBySlug } from '@/server/recruitment/jobs';

export default async function JobApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const job = await getPublishedJobBySlug(slug);
  if (!job) notFound();
  if (job.external_apply_url) redirect(job.external_apply_url);

  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <ApplicationForm jobId={job.id} jobTitle={job.title_ar} />
    </main>
  );
}
