import { jsonFail, jsonOk } from '@/server/api';
import { FONT_STACKS, getPublicBranding } from '@/server/branding';

export const dynamic = 'force-dynamic';

// Public, read-only branding sync used by every open tab to re-apply the
// current font/logo on each client-side navigation (root layout does not
// re-render on <Link> transitions, so this is what keeps already-open
// sessions in sync after an admin changes the setting).
export async function GET() {
  try {
    const branding = await getPublicBranding();
    // BrandingSync calls this on every client-side route change (potentially
    // many times per session); a short shared-cache window avoids a DB hit
    // per navigation while still reflecting an admin's change within ~10s.
    return jsonOk(
      { fontStack: FONT_STACKS[branding.fontChoice], logoUrl: branding.logoUrl },
      { headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=60' } },
    );
  } catch (error) {
    return jsonFail(error);
  }
}
