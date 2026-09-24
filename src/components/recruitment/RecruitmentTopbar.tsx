import Link from 'next/link';

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
    <header style={{ background: '#173BD1', color: '#fff', padding: '10px 34px' }}>
      <div style={{ maxWidth, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, minHeight: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(255,255,255,.38)',
              background: "rgba(255,255,255,.13) url('/brand-logo.png') center/23px 29px no-repeat",
              filter: 'brightness(0) invert(1)', flexShrink: 0,
            }}
            aria-label="شعار السويد"
          />
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 13, opacity: 0.8 }}>لوحة التوظيف</p>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>{pageTitle}</h1>
          </div>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              style={{
                color: item.key === active ? '#fff' : 'rgba(255,255,255,.75)',
                fontSize: 13,
                fontWeight: item.key === active ? 600 : 400,
                textDecoration: 'none',
              }}
            >
              {item.label}
            </Link>
          ))}
          <a
            href="/"
            style={{
              color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,.28)',
              borderRadius: 10, padding: '9px 13px', fontSize: 12,
            }}
          >
            الأنظمة
          </a>
        </nav>
      </div>
    </header>
  );
}
