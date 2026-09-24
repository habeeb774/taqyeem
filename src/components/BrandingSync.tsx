'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Next.js keeps the root layout mounted across <Link> navigations, so the
// server-rendered :root override in layout.tsx only reflects whatever the
// branding was when this tab first loaded a page. This re-applies the
// current font/logo directly on <html> every time the route changes, so an
// already-open tab (or one that jumped in from a legacy full-HTML page)
// picks up a branding change without needing a hard reload.
export function BrandingSync() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/app/branding', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        const root = document.documentElement.style;
        root.setProperty('--app-font', data.fontStack, 'important');
        root.setProperty('--ff', data.fontStack, 'important');
        if (data.logoUrl) {
          root.setProperty('--brand-logo-url', `url('${data.logoUrl}')`, 'important');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
