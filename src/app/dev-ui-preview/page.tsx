import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';
import UiPreviewClient from './UiPreviewClient';

// Throwaway manual verification page for src/components/ui/* — safe to delete.
// Guarded behind login so it's never a public surface.
export default async function UiPreviewPage() {
  try {
    await requireUser();
  } catch {
    redirect('/login');
  }
  return <UiPreviewClient />;
}
