import { describe, expect, it } from 'vitest';
import { availableTasks } from './tasks';

describe('permitted task shortcuts', () => {
  it('does not offer privileged tasks to a user without permissions', () => {
    expect(availableTasks([])).toEqual([]);
    expect(availableTasks(['forms.view', 'evaluations.view'])).toEqual([]);
  });
  it('offers review and approval directly to the relevant users', () => {
    expect(availableTasks(['evaluations.view', 'evaluations.approve', 'forms.view', 'forms.approve'])).toEqual([
      { label: 'راجع التقييمات', href: '/assessment?task=review' },
      { label: 'راجع طلبات الموافقة', href: '/forms?task=approvals' },
    ]);
  });
  it('requires access to the system as well as the action', () => {
    expect(availableTasks(['forms.approve', 'reports.view', 'evaluations.edit'])).toEqual([]);
  });
});
