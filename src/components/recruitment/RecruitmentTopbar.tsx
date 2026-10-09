import Link from 'next/link';
import { SystemTopbar } from '@/components/SystemTopbar';

const navItems = [
  { key: 'overview', href: '/admin/recruitment', label: 'نظرة عامة' },
  { key: 'jobs', href: '/admin/recruitment/jobs', label: 'الوظائف' },
  { key: 'applications', href: '/admin/recruitment/applications', label: 'المتقدمون' },
  { key: 'settings', href: '/admin/recruitment/settings', label: 'الإعدادات' },
] as const;

export function RecruitmentTopbar({
  pageTitle,
  active,
}: {
  pageTitle: string;
  active: (typeof navItems)[number]['key'] | null;
  maxWidth?: number;
}) {
  return (
    <SystemTopbar
      title={`التوظيف · ${pageTitle}`}
      tabs={navItems.map((item) => (
        <Link key={item.key} href={item.href} aria-current={item.key === active ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    />
  );
}
