import { redirect } from 'next/navigation';
import { requireUser } from '@/server/context';

/** Loads the user for a /forms/* page; redirects to /login or /forms when not allowed. */
export async function requireFormsPage(anyOf: string[]) {
  const context = await requireUser().catch(() => redirect('/login'));
  if (!context.permissions.includes('forms.view')) redirect('/');
  if (anyOf.length && !anyOf.some((code) => context.permissions.includes(code))) redirect('/forms');
  return context;
}
