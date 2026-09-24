import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'التقديم العام | شركة السويد التجارية',
  description: 'أرسل سيرتك الذاتية لشركة السويد التجارية حتى لو لم تجد وظيفة شاغرة تناسبك حاليًا.',
};

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
