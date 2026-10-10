'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

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

// One permissions lookup per page load, shared by every SystemTopbar instance.
let settingsAccess: Promise<boolean> | null = null;
function loadSettingsAccess() {
  settingsAccess ??= fetch('/api/app/auth/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => Boolean(data?.permissions?.includes('settings.manage')))
    .catch(() => false);
  return settingsAccess;
}

export function SystemTopbar({ title, tabs }: { title?: string; tabs?: ReactNode }) {
  const path = usePathname() || '/';
  // The settings link shows on every page for users who can manage settings (same rule as system-topbar.js).
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    let alive = true;
    loadSettingsAccess().then((allowed) => alive && setShowSettings(allowed));
    return () => {
      alive = false;
    };
  }, []);
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
