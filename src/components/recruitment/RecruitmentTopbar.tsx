import Link from 'next/link';
import { PageHeader } from '@/components/ui';

const navItems = [
  { key: 'overview', href: '/admin/recruitment', label: 'نظرة عامة' },
  { key: 'jobs', href: '/admin/recruitment/jobs', label: 'الوظائف' },
  { key: 'applications', href: '/admin/recruitment/applications', label: 'المتقدمون' },
  { key: 'settings', href: '/admin/recruitment/settings', label: 'الإعدادات' },
] as const;

export function RecruitmentTopbar({
  pageTitle,
  active,
  maxWidth = 1000,
}: {
  pageTitle: string;
  active: (typeof navItems)[number]['key'] | null;
  maxWidth?: number;
}) {
  return (
    <PageHeader
      eyebrow="لوحة التوظيف"
      title={pageTitle}
      maxWidth={maxWidth}
      brandMark={
        <div
          style={{
            width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(255,255,255,.38)',
            background: "rgba(255,255,255,.13) var(--brand-logo-url) center/23px 29px no-repeat",
            filter: 'brightness(0) invert(1)', flexShrink: 0,
          }}
          aria-label="شعار السويد"
        />
      }
      nav={
        <>
          {navItems.map((item) => (
            <Link key={item.key} href={item.href} aria-current={item.key === active ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
          <a
            href="/"
            style={{
              color: '#fff', border: '1px solid rgba(255,255,255,.28)',
              borderRadius: 10, padding: '9px 13px', fontSize: 12,
            }}
          >
            الأنظمة
          </a>
        </>
      }
    />
  );
}
