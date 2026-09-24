import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { must } from '@/db/queries/security';
import { uploadRecruitmentPageImage, type RecruitmentImageSlot } from '@/server/recruitment-storage';

export const dynamic = 'force-dynamic';

const slots = new Set<RecruitmentImageSlot>(['jobs_sidebar', 'job_detail']);

export async function POST(request: Request) {
  try {
    const context = await requireUser();
    must(context, 'recruitment.jobs.manage');

    const formData = await request.formData();
    const file = formData.get('file');
    const slot = formData.get('slot');

    if (!(file instanceof File)) {
      throw Object.assign(new Error('FILE_REQUIRED'), { status: 400 });
    }
    if (typeof slot !== 'string' || !slots.has(slot as RecruitmentImageSlot)) {
      throw Object.assign(new Error('INVALID_SLOT'), { status: 400 });
    }

    const result = await uploadRecruitmentPageImage(file, context.organizationId, slot as RecruitmentImageSlot);
    return jsonOk({ url: result.url });
  } catch (error) {
    return jsonFail(error);
  }
}
