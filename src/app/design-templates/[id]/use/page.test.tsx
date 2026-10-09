import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ api: vi.fn(), preview: false, id: 'first' }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: mocks.id }),
  useSearchParams: () => ({ get: () => mocks.preview ? '1' : null }),
}));
vi.mock('@/components/design-shell', () => ({
  DesignShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  designApi: mocks.api,
}));
import UsePage from './page';

const template = (name: string) => ({ template: { name, width: 800, height: 400 }, fields: [] });

beforeEach(() => {
  mocks.preview = false;
  mocks.id = 'first';
  mocks.api.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  mocks.api.mockImplementation(async (url: string) => {
    if (url === '/api/app/auth/me') return { permissions: ['design_templates.view', 'design_templates.use'] };
    if (url === '/api/design-fonts') return { fonts: [] };
    if (url === '/api/design-data') return { employees: [], departments: [], branches: [], job_titles: [] };
    return template('القالب الأول');
  });
});

describe('design use and preview loading', () => {
  it('lets a viewer preview without requesting restricted employee data or showing export actions', async () => {
    mocks.preview = true;
    mocks.api.mockImplementation(async (url: string) => {
      if (url === '/api/app/auth/me') return { permissions: ['design_templates.view'] };
      if (url === '/api/design-fonts') return { fonts: [] };
      if (url === '/api/design-data') throw new Error('FORBIDDEN');
      return template('قالب المعاينة');
    });
    render(<UsePage />);
    expect(await screen.findByRole('heading', { name: 'معاينة القالب: قالب المعاينة' })).toBeInTheDocument();
    expect(mocks.api).not.toHaveBeenCalledWith('/api/design-data');
    expect(screen.queryByRole('button', { name: 'تحميل فقط' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'استخدام القالب' })).not.toBeInTheDocument();
  });

  it('recovers from a failed template request through an explicit retry', async () => {
    mocks.api.mockRejectedValueOnce(new Error('تعذر تحميل القالب'));
    render(<UsePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل القالب');
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await screen.findByRole('heading', { name: 'استخدام القالب: القالب الأول' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تحميل فقط' })).not.toBeInTheDocument();
    expect(screen.getByText(/تحميله يحتاج صلاحية/)).toBeInTheDocument();
  });

  it('ignores an older template response after navigating to another template', async () => {
    let finish!: (value: ReturnType<typeof template>) => void;
    mocks.api.mockImplementation((url: string) => {
      if (url.endsWith('/first')) return new Promise(resolve => { finish = resolve; });
      if (url === '/api/app/auth/me') return Promise.resolve({ permissions: ['design_templates.view', 'design_templates.use'] });
      if (url === '/api/design-fonts') return Promise.resolve({ fonts: [] });
      if (url === '/api/design-data') return Promise.resolve({ employees: [] });
      return Promise.resolve(template('القالب الثاني'));
    });
    const { rerender } = render(<UsePage />);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    mocks.id = 'second';
    rerender(<UsePage />);
    expect(await screen.findByRole('heading', { name: 'استخدام القالب: القالب الثاني' })).toBeInTheDocument();
    await act(async () => { finish(template('القالب الأول')); });
    expect(screen.getByRole('heading', { name: 'استخدام القالب: القالب الثاني' })).toBeInTheDocument();
    expect(screen.queryByText('استخدام القالب: القالب الأول')).not.toBeInTheDocument();
  });
});
