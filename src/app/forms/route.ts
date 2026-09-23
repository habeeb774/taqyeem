import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { requireUser, must, jsonError } from '@/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function stripInlineFormDefinitions(template: string) {
  return template.replace(
    /const FORMS = \[[\s\S]*?\n\];\n\nconst DEFAULT_SIGS/,
    'const FORMS = [];\n\nconst DEFAULT_SIGS',
  );
}

/** Protected server route for the original forms interface. */
export async function GET() {
  try {
    const context = await requireUser();
    must(context, 'forms.view');
    const template = await readFile(join(process.cwd(), 'src', 'templates', 'forms.html'), 'utf8');
    // The original interface carried its seed catalogue inline.  Do not send that
    // data to the browser: the client loads the permitted template catalogue from
    // /api/app/forms?templates=1 after this server-side authorization check.
    const html = stripInlineFormDefinitions(template).replace('</head>', '<link rel="stylesheet" href="/unified-font.css"><link rel="stylesheet" href="/system-topbar.css"><script defer src="/system-topbar.js"></script></head>');
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
