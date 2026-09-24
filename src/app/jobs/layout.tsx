import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'الوظائف الشاغرة | شركة السويد التجارية',
  description: 'تصفح الوظائف الشاغرة في شركة السويد التجارية وقدّم طلبك مباشرة.',
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
