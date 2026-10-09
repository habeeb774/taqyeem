'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Same markup and classes as public/system-topbar.js, which the static
// assessment/forms pages use, so every system shares one top bar.
const systems = [
  { href: '/', label: 'الرئيسية' },
  { href: '/assessment', label: 'التقييم' },
  { href: '/forms', label: 'النماذج' },
  { href: '/design-templates', label: 'قوالب التصاميم' },
  { href: '/generated-designs', label: 'سجل التصاميم' },
  { href: '/admin/recruitment', label: 'التوظيف' },
];

export function SystemTopbar({
  title,
  tabs,
  showSettings = false,
}: {
  title?: string;
  tabs?: ReactNode;
  showSettings?: boolean;
}) {
  const path = usePathname() || '/';
  const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

  async function logout() {
    try {
      await fetch('/api/app/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      location.assign('/login');
    }
  }

  return (
    <>
      <header className="unified-topbar no-print">
        <div className="unified-topbar__brand">
          <span className="unified-topbar__mark" role="img" aria-label="شعار السويد" />
          <span>منصة الأنظمة الإدارية</span>
        </div>
        <nav className="unified-topbar__nav" aria-label="التنقل بين الأنظمة">
          {systems.map((item) => (
            <Link key={item.href} href={item.href} className={isActive(item.href) ? 'is-active' : ''}>
              {item.label}
            </Link>
          ))}
          {showSettings && (
            <Link href="/admin/branding" className={isActive('/admin/branding') ? 'is-active' : ''} title="إعدادات النظام">
              الإعدادات
            </Link>
          )}
          <button type="button" className="unified-topbar__logout" onClick={logout}>
            خروج
          </button>
        </nav>
      </header>

      {(title || tabs) && (
        <div className="unified-subbar no-print">
          <div className="unified-subbar__inner">
            {title && <h1 className="unified-subbar__title">{title}</h1>}
            {tabs && <nav className="unified-subbar__tabs">{tabs}</nav>}
          </div>
        </div>
      )}
    </>
  );
}
