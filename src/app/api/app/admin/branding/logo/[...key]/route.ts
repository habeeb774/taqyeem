import { NextResponse } from 'next/server';
import { BRANDING_LOGO_PREFIX, readBrandLogo } from '@/server/branding-storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const { key } = await params;
    const storageKey = key.map(decodeURIComponent).join('/');

    if (!storageKey.includes(`/${BRANDING_LOGO_PREFIX}/`) || storageKey.includes('..')) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    const object = await readBrandLogo(storageKey);
    if (!object.bytes) {
      return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
    }

    return new NextResponse(Buffer.from(object.bytes), {
      headers: {
        'Content-Type': object.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }
}
