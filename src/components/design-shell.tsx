'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import '@/app/design.css';
import '@/app/design-font.css';
import { PageHeader } from '@/components/ui';

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
      <PageHeader
        title="منصة الأنظمة الإدارية"
        brandMark={
          <div
            style={{
              width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(255,255,255,.38)',
              background: "rgba(255,255,255,.13) var(--brand-logo-url) center/23px 29px no-repeat",
              filter: 'brightness(0) invert(1)',
            }}
            aria-label="شعار السويد"
          />
        }
        nav={
          <>
            <Link href="/" aria-current={path === '/' ? 'page' : undefined}>
              الرئيسية
            </Link>

            {can('evaluations.view', 'evaluations.create', 'evaluations.edit') && (
              <Link href="/assessment" aria-current={path.startsWith('/assessment') ? 'page' : undefined}>
                التقييم
              </Link>
            )}

            {can('forms.view', 'forms.use_templates', 'forms.manage_templates') && (
              <Link href="/forms" aria-current={path.startsWith('/forms') ? 'page' : undefined}>
                النماذج
              </Link>
            )}

            {can('design_templates.view') && (
              <Link href="/design-templates" aria-current={path.startsWith('/design-templates') ? 'page' : undefined}>
                قوالب التصاميم
              </Link>
            )}

            {can('generated_designs.view') && (
              <Link href="/generated-designs" aria-current={path.startsWith('/generated-designs') ? 'page' : undefined}>
                سجل التصاميم
              </Link>
            )}

            {can('recruitment.jobs.view') && (
              <Link href="/admin/recruitment" aria-current={path.startsWith('/admin/recruitment') ? 'page' : undefined}>
                التوظيف
              </Link>
            )}

            <button
              onClick={logout}
              style={{ color: '#fff', border: '1px solid rgba(255,255,255,.28)', borderRadius: 10, padding: '9px 13px', fontSize: 12, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              خروج
            </button>
          </>
        }
      />

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
