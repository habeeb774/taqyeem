import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/db', () => ({ pool: {} }));
vi.mock('@/db/queries/security', () => ({}));

import { jsonError } from './context';

describe('actionable API errors', () => {
  it.each(['evaluation_incomplete', 'required_comment_missing', 'evaluation_not_editable', 'invalid_transition', 'cycle_not_found'])(
    'preserves the safe workflow error %s', message => {
      expect(jsonError(new Error(message)).error).toBe(message);
    },
  );
  it('returns a conflict without exposing database details', () => {
    const error = Object.assign(new Error('duplicate key in private_table'), { code: '23505' });
    expect(jsonError(error)).toEqual({ status: 409, error: 'RECORD_ALREADY_EXISTS' });
  });
  it('explains a referenced-record conflict', () => {
    expect(jsonError({ code: '23503' })).toEqual({ status: 409, error: 'RELATED_RECORD_CONFLICT' });
  });
  it('does not expose an unexpected database error', () => {
    expect(jsonError(new Error('private SQL or connection details')).error).toBe('REQUEST_FAILED');
  });
});
