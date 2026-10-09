import { redirect } from 'next/navigation';
import { FormsTopbar } from '../_shared/FormsTopbar';
import { requireFormsPage } from '../_shared/server';
import { EditorClient } from './EditorClient';

export const dynamic = 'force-dynamic';

export default async function FormEditPage({ searchParams }: { searchParams: Promise<{ form?: string; doc?: string }> }) {
  const { form, doc } = await searchParams;
  if (!form && !doc) redirect('/forms');
  const context = await requireFormsPage([]);
  const has = (code: string) => context.permissions.includes(code);
  return (
    <main dir="rtl" className="forms-page">
      <FormsTopbar active="forms" permissions={context.permissions} />
      <EditorClient
        formKey={form || null}
        documentNo={doc || null}
        userId={context.user.id}
        isEmployeeRole={context.roles.some((role) => role.code === 'employee')}
        ownEmployeeId={context.user.employeeId ? String(context.user.employeeId) : null}
        can={{ create: has('forms.create'), print: has('forms.print'), submit: has('forms.submit') }}
      />
    </main>
  );
}
