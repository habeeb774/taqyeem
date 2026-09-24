import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import ApplicationsClient from './ApplicationsClient';

export default async function ApplicationsAdminPage() {
  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    redirect('/login');
  }
  if (!context.permissions.includes('recruitment.applications.view')) redirect('/');

  return <ApplicationsClient />;
}
