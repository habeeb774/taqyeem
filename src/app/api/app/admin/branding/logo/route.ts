import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { must } from '@/db/queries/security';
import { uploadBrandLogo } from '@/server/branding-storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const context = await requireUser();
    must(context, 'settings.manage');

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw Object.assign(new Error('FILE_REQUIRED'), { status: 400 });
    }

    const result = await uploadBrandLogo(file, context.organizationId);
    return jsonOk({ url: result.url });
  } catch (error) {
    return jsonFail(error);
  }
}
