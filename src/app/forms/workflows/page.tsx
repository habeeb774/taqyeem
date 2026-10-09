import { FormsTopbar } from '../_shared/FormsTopbar';
import { requireFormsPage } from '../_shared/server';
import { WorkflowsClient } from './WorkflowsClient';

export const dynamic = 'force-dynamic';

export default async function FormWorkflowsPage() {
  const context = await requireFormsPage(['forms.manage_workflows']);
  return (
    <main dir="rtl" className="forms-page">
      <FormsTopbar active="workflows" permissions={context.permissions} />
      <WorkflowsClient />
    </main>
  );
}
