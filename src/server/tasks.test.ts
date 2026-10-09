import { describe, expect, it } from 'vitest';
import { availableTasks } from './tasks';

describe('permitted task shortcuts', () => {
  it('offers the personal evaluation task to an employee without management permissions', () => {
    expect(availableTasks([], true)).toEqual([{ label: 'اطّلع على تقييمك', href: '/my-evaluations' }]);
  });
  it('does not offer privileged tasks to a user without permissions', () => {
    expect(availableTasks([])).toEqual([]);
    expect(availableTasks(['forms.view', 'evaluations.view'])).toEqual([]);
  });
  it('offers review and approval directly to the relevant users', () => {
    expect(availableTasks(['evaluations.view', 'evaluations.approve', 'forms.view', 'forms.approve'])).toEqual([
      { label: 'راجع التقييمات', href: '/assessment?task=review' },
      { label: 'راجع طلبات الموافقة', href: '/forms/approvals' },
    ]);
  });
  it('requires access to the system as well as the action', () => {
    expect(availableTasks(['forms.approve', 'reports.view', 'evaluations.edit'])).toEqual([]);
  });
  it('offers design creation only when the user can view, use and export templates', () => {
    const permissions = ['design_templates.view', 'design_templates.use', 'design_templates.export'];
    expect(availableTasks(permissions)).toEqual([
      { label: 'أنشئ تصميمًا', href: '/design-templates?task=create-design' },
    ]);
    for (const omitted of permissions) {
      expect(availableTasks(permissions.filter(permission => permission !== omitted))).toEqual([]);
    }
  });
});
