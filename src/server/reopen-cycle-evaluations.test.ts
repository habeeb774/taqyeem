import { describe, expect, it, vi } from 'vitest';
import type { SecurityContext } from '@/db/queries/security';
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), must: vi.fn() }));
vi.mock('@/server/context', () => ({ must: mocks.must }));
vi.mock('@/lib/neon/admin', () => ({ withNeonTransaction: mocks.transaction }));
import { reopenCycleEvaluations } from './reopen-cycle-evaluations';

const input = { cycle_id: '00000000-0000-4000-8000-000000000001', reason: 'تصحيح التقييمات' };
describe('bulk reopening authorization', () => {
  it('rejects a non-admin even with the reopen permission before starting a transaction', async () => {
    mocks.transaction.mockClear();
    const context = { roles: [{ code: 'hr_admin' }], permissions: ['evaluations.reopen'] } as SecurityContext;
    await expect(reopenCycleEvaluations(context, input)).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('records each previous status and preserves answers when reopening the selected cycle', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: input.cycle_id }] });
    query.mockResolvedValueOnce({ rows: [{ id: 'evaluation', status: 'published' }] });
    mocks.transaction.mockImplementation(fn => fn({ query }));
    const context = { roles: [{ code: 'super_admin' }], user: { id: 'admin' }, organizationId: 'org' } as SecurityContext;
    expect(await reopenCycleEvaluations(context, input)).toBe(1);
    expect(mocks.must).toHaveBeenCalledWith(context, 'evaluations.reopen');
    expect(query.mock.calls[1][1]).toEqual([input.cycle_id, 'org']);
    expect(query.mock.calls[3][1]).toContain(JSON.stringify({ status: 'published' }));
    expect(query.mock.calls.map(call => call[0]).join(' ')).not.toMatch(/delete|evaluation_answers/i);
  });
});
