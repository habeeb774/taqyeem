import Link from 'next/link';
import { SystemTopbar } from '@/components/SystemTopbar';

export type FormsTab = 'forms' | 'archive' | 'approvals' | 'workflows';

const tabs: { key: FormsTab; href: string; label: string; visible: (permissions: string[]) => boolean }[] = [
  { key: 'forms', href: '/forms', label: 'النماذج', visible: () => true },
  { key: 'archive', href: '/forms/archive', label: 'سجلّ المستندات', visible: () => true },
  {
    key: 'approvals',
    href: '/forms/approvals',
    label: 'الموافقات',
    visible: (permissions) => permissions.includes('forms.approve') || permissions.includes('forms.reject'),
  },
  {
    key: 'workflows',
    href: '/forms/workflows',
    label: 'مسارات الموافقات',
    visible: (permissions) => permissions.includes('forms.manage_workflows'),
  },
];

export function FormsTopbar({ active, permissions }: { active: FormsTab; permissions: string[] }) {
  return (
    <SystemTopbar
      title="النماذج الإدارية"
      tabs={tabs
        .filter((tab) => tab.visible(permissions))
        .map((tab) => (
          <Link key={tab.key} href={tab.href} aria-current={tab.key === active ? 'page' : undefined}>
            {tab.label}
          </Link>
        ))}
    />
  );
}
