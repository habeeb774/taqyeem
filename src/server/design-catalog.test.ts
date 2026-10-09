import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), requireUser: vi.fn(), must: vi.fn() }));
vi.mock('@/db', () => ({ pool: { query: mocks.query } }));
vi.mock('@/server/context', () => ({
  requireUser: mocks.requireUser, must: mocks.must,
  can: () => true,
  jsonError: (error: { status?: number; message?: string }) => ({ status: error.status || 500, error: error.message }),
}));
vi.mock('@/server/designs', () => ({ slugify: vi.fn(), templateInput: {} }));
import { GET } from '@/app/api/design-templates/route';

beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
  mocks.requireUser.mockReset().mockResolvedValue({ organizationId: 'organization' });
  mocks.must.mockReset();
});

describe('ready design catalog query', () => {
  it('applies organization, publication and background requirements on the server even for managers', async () => {
    const response = await GET(new NextRequest('https://example.test/api/design-templates?ready=1'));
    expect(response.status).toBe(200);
    expect(mocks.must).toHaveBeenCalledWith(expect.anything(), 'design_templates.view');
    const [sql, values] = mocks.query.mock.calls[0];
    expect(sql).toContain('t.organization_id = $1::uuid');
    expect(sql).toContain('t.deleted_at is null');
    expect(sql).toContain("not $9::boolean or (t.status = 'published' and nullif(t.background_image_url, '') is not null)");
    expect(values[0]).toBe('organization');
    expect(values[8]).toBe(true);
    expect(mocks.query.mock.calls[1][1]).toEqual(['organization', true, true]);
  });
  it('keeps the full management catalog available outside the task flow', async () => {
    await GET(new NextRequest('https://example.test/api/design-templates'));
    expect(mocks.query.mock.calls[0][1][8]).toBe(false);
  });
  it('does not query templates when view access is denied', async () => {
    mocks.must.mockImplementation(() => { throw Object.assign(new Error('FORBIDDEN'), { status: 403 }); });
    const response = await GET(new NextRequest('https://example.test/api/design-templates?ready=1'));
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
