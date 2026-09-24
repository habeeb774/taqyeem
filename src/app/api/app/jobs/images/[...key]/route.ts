import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/server/cors';
import { PUBLIC_IMAGE_PREFIX, readRecruitmentPageImage } from '@/server/recruitment-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const headers = corsHeaders(request);
  try {
    const { key } = await params;
    const storageKey = key.map(decodeURIComponent).join('/');

    if (!storageKey.includes(`/${PUBLIC_IMAGE_PREFIX}/`) || storageKey.includes('..')) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404, headers });
    }

    const object = await readRecruitmentPageImage(storageKey);
    if (!object.bytes) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404, headers });
    }

    return new NextResponse(Buffer.from(object.bytes), {
      headers: {
        ...headers,
        'Content-Type': object.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404, headers });
  }
}
