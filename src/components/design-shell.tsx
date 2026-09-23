'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import '@/app/design.css';
import '@/app/design-font.css';

export function DesignShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    designApi('/api/app/auth/me')
      .then((response) => setPermissions(response.permissions || []))
      .catch(() => {});
  }, []);

  const can = (...codes: string[]) => codes.some((code) => permissions.includes(code));

  async function logout() {
    await fetch('/api/app/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <div className="ds-shell">
      <header className="unified-topbar">
        <div className="unified-topbar__brand">
          <span className="unified-topbar__mark">ت</span>
          <span>منصة الأنظمة الإدارية</span>
        </div>

        <nav className="unified-topbar__nav" aria-label="التنقل بين الأنظمة">
          <Link className={path === '/' ? 'is-active' : ''} href="/">
            الرئيسية
          </Link>

          {can('evaluations.view', 'evaluations.create', 'evaluations.edit') && (
            <Link className={path.startsWith('/assessment') ? 'is-active' : ''} href="/assessment">
              التقييم
            </Link>
          )}

          {can('forms.view', 'forms.use_templates', 'forms.manage_templates') && (
            <Link className={path.startsWith('/forms') ? 'is-active' : ''} href="/forms">
              النماذج
            </Link>
          )}

          {can('design_templates.view') && (
            <Link
              className={path.startsWith('/design-templates') ? 'is-active' : ''}
              href="/design-templates"
            >
              قوالب التصاميم
            </Link>
          )}

          {can('generated_designs.view') && (
            <Link
              className={path.startsWith('/generated-designs') ? 'is-active' : ''}
              href="/generated-designs"
            >
              سجل التصاميم
            </Link>
          )}

          <button className="unified-topbar__logout" onClick={logout}>
            خروج
          </button>
        </nav>
      </header>

      {children}
    </div>
  );
}

export async function designApi<T = any>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    location.href = '/login';
    throw new Error('UNAUTHENTICATED');
  }

  if (!response.ok) {
    throw new Error(data.error || 'تعذر إكمال الطلب');
  }

  return data;
}
