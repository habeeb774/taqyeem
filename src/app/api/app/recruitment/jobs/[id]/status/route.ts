import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { changeJobStatus } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

const statusSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'published', 'paused', 'closed', 'archived']),
  publish_at: z.string().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const value = statusSchema.parse(await request.json());
    const job = await changeJobStatus(context, id, value.status, value.publish_at);
    return jsonOk({ job });
  } catch (error) {
    return jsonFail(error);
  }
}
