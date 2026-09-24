import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { getNotificationSettingsForAdmin, updateNotificationSettings } from '@/server/recruitment/settings';

export const dynamic = 'force-dynamic';

const notificationsSchema = z.object({
  hrNotificationEmail: z.string().trim().email().max(320).nullable().optional().or(z.literal('')),
});

export async function GET() {
  try {
    const context = await requireUser();
    const settings = await getNotificationSettingsForAdmin(context);
    return jsonOk({ settings });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireUser();
    const value = notificationsSchema.parse(await request.json());
    const settings = await updateNotificationSettings(context, {
      hrNotificationEmail: value.hrNotificationEmail || null,
    });
    return jsonOk({ settings });
  } catch (error) {
    return jsonFail(error);
  }
}
