import { ApplicationForm } from '@/components/recruitment/ApplicationForm';

export default function GeneralApplicationPage() {
  return (
    <main dir="rtl" style={{ minHeight: '100vh', background: '#fbfcfe', color: '#0d0d0d', fontFamily: 'var(--app-font)' }}>
      <ApplicationForm jobId={null} jobTitle={null} />
    </main>
  );
}
