import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { addApplicationNote } from '@/server/recruitment/applications';

export const dynamic = 'force-dynamic';

const noteSchema = z.object({ note: z.string().trim().min(1).max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const value = noteSchema.parse(await request.json());
    const note = await addApplicationNote(context, id, value.note);
    return jsonOk({ note });
  } catch (error) {
    return jsonFail(error);
  }
}
