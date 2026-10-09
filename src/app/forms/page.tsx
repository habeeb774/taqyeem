import { redirect } from 'next/navigation';
import { FormsTopbar } from './_shared/FormsTopbar';
import { requireFormsPage } from './_shared/server';
import { CatalogClient } from './CatalogClient';

export const dynamic = 'force-dynamic';

export default async function FormsCatalogPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  // Old links used /forms?task=approvals before approvals had their own page.
  if ((await searchParams).task === 'approvals') redirect('/forms/approvals');
  const context = await requireFormsPage([]);
  return (
    <main dir="rtl" className="forms-page">
      <FormsTopbar active="forms" permissions={context.permissions} />
      <CatalogClient canManageTemplates={context.permissions.includes('forms.manage_templates')} />
    </main>
  );
}
