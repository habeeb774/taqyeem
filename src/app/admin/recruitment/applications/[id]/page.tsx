import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import ApplicationDetailClient from './ApplicationDetailClient';

export default async function ApplicationDetailPage() {
  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    redirect('/login');
  }
  if (!context.permissions.includes('recruitment.applications.view')) redirect('/');

  return <ApplicationDetailClient />;
}
