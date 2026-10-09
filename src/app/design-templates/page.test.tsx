import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ api: vi.fn(), task: '', permissions: [] as string[] }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => mocks.task || null }),
}));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock('@/components/design-shell', () => ({
  DesignShell: ({ children }: { children: ReactNode }) => <div>{children}</div>, designApi: mocks.api,
}));
import DesignsPage from './page';

const list = (name?: string) => ({
  templates: name ? [{ id: 'template', name, status: 'published', width: 800, height: 400, updated_at: '2026-01-01' }] : [],
  total: name ? 1 : 0, creators: [],
});

beforeEach(() => {
  mocks.task = '';
  mocks.permissions = ['design_templates.view', 'design_templates.use'];
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (url: string) => {
    if (url === '/api/app/auth/me') return { permissions: mocks.permissions };
    if (url === '/api/design-categories') return { categories: [] };
    return list();
  });
});

describe('task focused design catalog', () => {
  it('requests ready published templates and keeps management actions out of the creation task', async () => {
    mocks.task = 'create-design';
    mocks.permissions.push('design_templates.create', 'design_templates.edit', 'design_templates.delete');
    mocks.api.mockImplementation(async (url: string) => {
      if (url === '/api/app/auth/me') return { permissions: mocks.permissions };
      if (url === '/api/design-categories') return { categories: [] };
      return list('قالب جاهز');
    });
    render(<DesignsPage />);
    expect(await screen.findByRole('heading', { name: 'قالب جاهز' })).toBeInTheDocument();
    const query = new URL(mocks.api.mock.calls.find(([url]) => url.startsWith('/api/design-templates?'))![0], 'https://example.test');
    expect(query.searchParams.get('ready')).toBe('1');
    expect(query.searchParams.get('status')).toBe('published');
    expect(screen.queryByLabelText('فلترة بالحالة')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('فلترة بالمنشئ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ترتيب النتائج')).not.toBeInTheDocument();
    expect(screen.getByLabelText('فلترة بالتصنيف')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'استخدام القالب' })).toHaveAttribute('href', '/design-templates/template/use');
    expect(screen.queryByRole('button', { name: '+ إضافة قالب تصميم' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'تعديل' })).not.toBeInTheDocument();
  });

  it('offers retry after a loading error and restores the catalog when the request succeeds', async () => {
    mocks.api.mockRejectedValueOnce(new Error('انقطع الاتصال'));
    render(<DesignsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('انقطع الاتصال');
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByText('لا توجد قوالب متاحة لك حاليًا.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/إضافة قالب تصميم جديد/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('فلترة بالحالة')).toBeEnabled();
    expect(screen.getByLabelText('فلترة بالمنشئ')).toBeInTheDocument();
    expect(screen.getByLabelText('ترتيب النتائج')).toBeInTheDocument();
  });

  it('keeps the latest search results when an older search finishes later', async () => {
    let finishOld!: (value: ReturnType<typeof list>) => void;
    mocks.api.mockImplementation((url: string) => {
      if (url === '/api/app/auth/me') return Promise.resolve({ permissions: mocks.permissions });
      if (url === '/api/design-categories') return Promise.resolve({ categories: [] });
      if (!new URL(url, 'https://example.test').searchParams.get('q')) {
        return new Promise(resolve => { finishOld = resolve; });
      }
      return Promise.resolve(list('القالب المطلوب'));
    });
    render(<DesignsPage />);
    await waitFor(() => expect(finishOld).toBeTypeOf('function'));
    fireEvent.change(screen.getByLabelText('بحث باسم القالب'), { target: { value: 'المطلوب' } });
    expect(await screen.findByRole('heading', { name: 'القالب المطلوب' })).toBeInTheDocument();
    await act(async () => { finishOld(list('نتيجة قديمة')); });
    expect(screen.queryByRole('heading', { name: 'نتيجة قديمة' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'القالب المطلوب' })).toBeInTheDocument();
  });
});
