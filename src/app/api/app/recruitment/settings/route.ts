import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { getRecruitmentSettingsForAdmin, updateRecruitmentSettings } from '@/server/recruitment/settings';

export const dynamic = 'force-dynamic';

const settingsSchema = z.object({
  heroTitle: z.string().trim().min(1).max(200),
  aboutParagraphs: z.array(z.string().trim().min(1).max(2000)).min(1).max(10),
  benefits: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  storeUrl: z.string().trim().url().max(500).nullable().optional().or(z.literal('')),
  jobsSidebarImageUrl: z.string().trim().max(500).nullable().optional().or(z.literal('')),
  jobDetailImageUrl: z.string().trim().max(500).nullable().optional().or(z.literal('')),
});

export async function GET() {
  try {
    const context = await requireUser();
    const settings = await getRecruitmentSettingsForAdmin(context);
    return jsonOk({ settings });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireUser();
    const value = settingsSchema.parse(await request.json());
    const settings = await updateRecruitmentSettings(context, {
      heroTitle: value.heroTitle,
      aboutParagraphs: value.aboutParagraphs,
      benefits: value.benefits,
      storeUrl: value.storeUrl || null,
      jobsSidebarImageUrl: value.jobsSidebarImageUrl || null,
      jobDetailImageUrl: value.jobDetailImageUrl || null,
    });
    return jsonOk({ settings });
  } catch (error) {
    return jsonFail(error);
  }
}
