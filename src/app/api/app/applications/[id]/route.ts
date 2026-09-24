import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { getApplicationForAdmin } from '@/server/recruitment/applications';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const result = await getApplicationForAdmin(context, id);
    return jsonOk(result);
  } catch (error) {
    return jsonFail(error);
  }
}
