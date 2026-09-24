import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import SettingsClient from './SettingsClient';

export default async function RecruitmentSettingsPage() {
  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    redirect('/login');
  }
  if (!context.permissions.includes('recruitment.jobs.manage')) redirect('/');

  return <SettingsClient />;
}
