import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { FONT_CHOICES, getBrandingForAdmin, updateBranding } from '@/server/branding';

export const dynamic = 'force-dynamic';

const brandingSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  logoUrl: z.string().trim().max(500).nullable().optional(),
  fontChoice: z.enum(FONT_CHOICES),
});

export async function GET() {
  try {
    const context = await requireUser();
    const branding = await getBrandingForAdmin(context);
    return jsonOk({ branding });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireUser();
    const value = brandingSchema.parse(await request.json());
    const branding = await updateBranding(context, {
      companyName: value.companyName,
      logoUrl: value.logoUrl || null,
      fontChoice: value.fontChoice,
    });
    return jsonOk({ branding });
  } catch (error) {
    return jsonFail(error);
  }
}
