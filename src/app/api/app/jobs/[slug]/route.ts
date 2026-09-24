import { jsonFail, jsonOk } from '@/server/api';
import { getPublishedJobBySlug } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const job = await getPublishedJobBySlug(slug);
    if (!job) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    return jsonOk({ job });
  } catch (error) {
    return jsonFail(error);
  }
}
