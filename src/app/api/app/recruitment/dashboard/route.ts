import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { getRecruitmentDashboard } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const context = await requireUser();
    const stats = await getRecruitmentDashboard(context);
    return jsonOk({ stats });
  } catch (error) {
    return jsonFail(error);
  }
}
