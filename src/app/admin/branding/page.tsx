import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import BrandingClient from './BrandingClient';

export default async function BrandingAdminPage() {
  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    redirect('/login');
  }
  if (!context.permissions.includes('settings.manage')) redirect('/');

  return <BrandingClient />;
}
