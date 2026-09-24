import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { duplicateJob } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const job = await duplicateJob(context, id);
    return jsonOk({ job });
  } catch (error) {
    return jsonFail(error);
  }
}
