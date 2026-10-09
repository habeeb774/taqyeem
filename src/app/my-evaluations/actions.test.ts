import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), user: vi.fn(), transaction: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/server/context', () => ({ requireUser: mocks.user }));
vi.mock('@/lib/neon/admin', () => ({ withNeonTransaction: mocks.transaction }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { requestReview } from './actions';

function data(note = 'أرجو مراجعة هذه الدرجة') {
  const form = new FormData();
  form.set('evaluation_id', 'a94e165f-65c3-4fe4-9c18-36c15edb4817');
  form.set('review_note', note);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ organizationId: 'org', user: { id: 'user', employeeId: 'employee', name: 'موظف' } });
  mocks.transaction.mockImplementation(async fn => fn({ query: mocks.query }));
  mocks.query.mockReset();
});
describe('employee review requests', () => {
  it('validates a short note before database writes', async () => {
    expect((await requestReview({ success: false, message: '' }, data('قص'))).success).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects an evaluation that does not belong to the employee', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    const result = await requestReview({ success: false, message: '' }, data());
    expect(result.success).toBe(false);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['employee', 'org']));
  });
  it('writes the audit and notification through one transaction', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ evaluator_user_id: 'manager', status: 'published' }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] });
    expect((await requestReview({ success: false, message: '' }, data())).success).toBe(true);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(mocks.query.mock.calls[3][1]).toContain('manager');
  });
  it('does not duplicate a recently recorded identical request', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ evaluator_user_id: 'manager', status: 'published' }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    expect((await requestReview({ success: false, message: '' }, data())).success).toBe(true);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it('returns retry guidance when the transaction fails', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('database unavailable'));
    const result = await requestReview({ success: false, message: '' }, data());
    expect(result.success).toBe(false);
    expect(result.message).toContain('أعد المحاولة');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
