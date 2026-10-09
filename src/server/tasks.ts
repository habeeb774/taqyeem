export function availableTasks(permissions: string[], hasEmployee = false) {
  const can = (permission: string) => permissions.includes(permission);
  return [
    hasEmployee && { label: 'اطّلع على تقييمك', href: '/my-evaluations' },
    can('evaluations.view') && can('evaluations.edit') && { label: 'قيّم موظفيك', href: '/assessment?task=evaluate' },
    can('evaluations.view') && ['evaluations.review', 'evaluations.approve', 'evaluations.publish'].some(can)
      && { label: 'راجع التقييمات', href: '/assessment?task=review' },
    can('forms.view') && can('forms.create') && { label: 'أنشئ مستندًا', href: '/forms' },
    can('forms.view') && ['forms.approve', 'forms.reject'].some(can)
      && { label: 'راجع طلبات الموافقة', href: '/forms?task=approvals' },
    can('evaluations.view') && can('reports.view') && { label: 'اطّلع على التقارير', href: '/assessment?task=reports' },
  ].filter((task): task is { label: string; href: string } => Boolean(task));
}
