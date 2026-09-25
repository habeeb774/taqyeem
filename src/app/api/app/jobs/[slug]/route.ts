import { NextResponse } from 'next/server';
import { jsonFail, jsonOk } from '@/server/api';
import { corsHeaders } from '@/server/cors';
import { getPublishedJobBySlug } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = { ...corsHeaders(request), 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' };
  try {
    const { slug } = await params;
    const job = await getPublishedJobBySlug(slug);
    if (!job) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    return jsonOk({ job }, { headers });
  } catch (error) {
    const response = jsonFail(error);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
