import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { jsonError, requireUser } from '@/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The legacy assessment interface is served only after server authentication. */
export async function GET() {
  try {
    await requireUser();
    const html = (await readFile(join(process.cwd(), 'src', 'templates', 'assessment.html'), 'utf8'))
      .replace('</head>', '<link rel="stylesheet" href="/unified-font.css"><link rel="stylesheet" href="/permissions-scroll.css?v=20260922-native-scroll"><link rel="stylesheet" href="/system-topbar.css"><script defer src="/system-topbar.js"></script></head>');
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const failure = jsonError(error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
}
