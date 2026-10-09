import { redirect } from 'next/navigation';
import { FormsTopbar } from '../_shared/FormsTopbar';
import { requireFormsPage } from '../_shared/server';
import { ViewClient } from './ViewClient';

export const dynamic = 'force-dynamic';

export default async function FormViewPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { doc } = await searchParams;
  if (!doc) redirect('/forms/archive');
  const context = await requireFormsPage([]);
  return (
    <main dir="rtl" className="forms-page">
      <FormsTopbar active="archive" permissions={context.permissions} />
      <ViewClient documentNo={doc} canPrint={context.permissions.includes('forms.print')} />
    </main>
  );
}
