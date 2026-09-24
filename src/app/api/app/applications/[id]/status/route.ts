import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { changeApplicationStatus } from '@/server/recruitment/applications';

export const dynamic = 'force-dynamic';

const statusSchema = z.object({
  status: z.enum([
    'new', 'reviewing', 'shortlisted', 'interview', 'second_interview',
    'offer', 'hired', 'rejected', 'withdrawn', 'archived',
  ]),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const value = statusSchema.parse(await request.json());
    const application = await changeApplicationStatus(context, id, value.status, value.note);
    return jsonOk({ application });
  } catch (error) {
    return jsonFail(error);
  }
}
