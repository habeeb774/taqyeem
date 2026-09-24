import { NextResponse } from 'next/server';
import { jsonError, requireUser } from '@/server/context';
import { getApplicationCvForAdmin } from '@/server/recruitment/applications';
import { readCv } from '@/server/recruitment-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const { cv_storage_key: storageKey, cv_file_name: fileName } = await getApplicationCvForAdmin(context, id);

    const prefix = `organizations/${context.organizationId}/applications/`;
    if (!storageKey.startsWith(prefix) || storageKey.includes('..')) {
      throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
    }

    const object = await readCv(storageKey);
    if (!object.bytes) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    return new NextResponse(Buffer.from(object.bytes), {
      headers: {
        'Content-Type': object.contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json({ ok: false, error: response.error }, { status: response.status });
  }
}
