import { NextResponse } from 'next/server';

import { can, jsonError, requireUser } from '@/server/context';
import { readDesignAsset } from '@/server/design-storage';

export const runtime = 'nodejs';

function canReadDesignAssets(context: Awaited<ReturnType<typeof requireUser>>) {
  return (
    can(context, 'design_templates.view') ||
    can(context, 'design_templates.use') ||
    can(context, 'design_templates.export') ||
    can(context, 'generated_designs.view')
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  try {
    const context = await requireUser();
    if (!canReadDesignAssets(context)) {
      throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
    }

    const { key } = await params;
    const storageKey = key.map(decodeURIComponent).join('/');
    const prefix = `organizations/${context.organizationId}/designs/`;

    if (!storageKey.startsWith(prefix) || storageKey.includes('..')) {
      throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
    }

    const object = await readDesignAsset(storageKey);
    if (!object.bytes) {
      throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    }

    return new NextResponse(Buffer.from(object.bytes), {
      headers: {
        'Content-Type': object.contentType,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
