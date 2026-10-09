'use client';

import type { ReactNode } from 'react';
import '@/app/design.css';
import '@/app/design-font.css';
import { SystemTopbar } from '@/components/SystemTopbar';

export function DesignShell({ children }: { children: ReactNode }) {
  return (
    <div className="ds-shell">
      <SystemTopbar />
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
