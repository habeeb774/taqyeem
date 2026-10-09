import { FormsTopbar } from '../_shared/FormsTopbar';
import { requireFormsPage } from '../_shared/server';
import { ApprovalsClient } from './ApprovalsClient';

export const dynamic = 'force-dynamic';

export default async function FormApprovalsPage() {
  const context = await requireFormsPage(['forms.approve', 'forms.reject']);
  return (
    <main dir="rtl" className="forms-page">
      <FormsTopbar active="approvals" permissions={context.permissions} />
      <ApprovalsClient
        canApprove={context.permissions.includes('forms.approve')}
        canReject={context.permissions.includes('forms.reject')}
      />
    </main>
  );
}
