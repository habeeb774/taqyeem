import { FormsTopbar } from '../_shared/FormsTopbar';
import { requireFormsPage } from '../_shared/server';
import { ArchiveClient } from './ArchiveClient';

export const dynamic = 'force-dynamic';

export default async function FormArchivePage() {
  const context = await requireFormsPage([]);
  return (
    <main dir="rtl" className="forms-page">
      <FormsTopbar active="archive" permissions={context.permissions} />
      <ArchiveClient
        canCancel={context.permissions.includes('forms.cancel')}
        canArchive={context.permissions.includes('forms.archive')}
        canDelete={context.permissions.includes('forms.delete')}
      />
    </main>
  );
}
