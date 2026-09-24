import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import JobsClient from './JobsClient';

export default async function JobsAdminPage() {
  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    redirect('/login');
  }
  if (!context.permissions.includes('recruitment.jobs.view')) redirect('/');

  return <JobsClient />;
}
