import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({ api: vi.fn(), canvas: vi.fn(), preview: false, id: 'first' }));
vi.mock('@/lib/design-renderer', () => ({
  createDesignCanvas: mocks.canvas,
  loadDesignFonts: vi.fn().mockResolvedValue(undefined),
}));
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
  mocks.canvas.mockReset();
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

  it('discards a slow preview of old values instead of replacing the latest preview', async () => {
    const pending: ((blob: Blob) => void)[] = [];
    mocks.canvas.mockImplementation(() => ({ toBlob: (callback: (blob: Blob) => void) => pending.push(callback) }));
    let sequence = 0;
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL() { return `blob:test-${++sequence}`; }
      static revokeObjectURL() {}
    });
    vi.stubGlobal('Image', class {
      onload?: () => void;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['background']) }));
    mocks.api.mockImplementation(async (url: string) => {
      if (url === '/api/app/auth/me') return { permissions: ['design_templates.view', 'design_templates.use'] };
      if (url === '/api/design-fonts') return { fonts: [] };
      if (url === '/api/design-data') return { employees: [] };
      return {
        template: { name: 'قالب المعاينة', width: 800, height: 400, background_image_url: '/background.png' },
        fields: [{ content: '{{name}}', field_key: 'name', field_label: 'الاسم', field_type: 'text', is_dynamic: true, is_visible: true }],
      };
    });
    render(<UsePage />);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('الاسم'), { target: { value: 'النص الجديد' } });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[1](new Blob(['new preview'])); });
    const preview = screen.getByRole('img', { name: 'معاينة التصميم: قالب المعاينة' });
    const latestSource = preview.getAttribute('src');
    await act(async () => { pending[0](new Blob(['old preview'])); });
    expect(preview).toHaveAttribute('src', latestSource);
    expect(mocks.canvas.mock.calls[1][4]).toEqual({ name: 'النص الجديد' });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('does not ask users to fill invisible or required hidden layers', async () => {
    mocks.api.mockImplementation(async (url: string) => {
      if (url === '/api/app/auth/me') return { permissions: ['design_templates.view', 'design_templates.use'] };
      if (url === '/api/design-fonts') return { fonts: [] };
      if (url === '/api/design-data') return { employees: [] };
      return { ...template('قالب ثابت'), fields: [
        { content: '{{hidden}}', field_key: 'hidden', field_label: 'طبقة مخفية', is_dynamic: true, is_visible: false, is_required: true },
      ] };
    });
    render(<UsePage />);
    expect(await screen.findByText('هذا القالب لا يحتوي حقولًا متغيرة. يمكنك تصديره مباشرة.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'تحميل التصميم' })).toBeInTheDocument();
    expect(screen.queryByText('املأ الحقول وشاهد النتيجة مباشرة، ثم حمّل التصميم.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('طبقة مخفية')).not.toBeInTheDocument();
  });
});
