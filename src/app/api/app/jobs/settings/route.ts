import { NextRequest, NextResponse } from 'next/server';
import { jsonFail, jsonOk } from '@/server/api';
import { corsHeaders } from '@/server/cors';
import { getPublicRecruitmentSettings } from '@/server/recruitment/settings';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  // Company copy/benefits/hero title change only when an admin edits them.
  const headers = { ...corsHeaders(request), 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' };
  try {
    const settings = await getPublicRecruitmentSettings();
    return jsonOk({ settings }, { headers });
  } catch (error) {
    const response = jsonFail(error);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
