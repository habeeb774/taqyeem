import { NextRequest, NextResponse } from 'next/server';
import { jsonFail, jsonOk } from '@/server/api';
import { corsHeaders } from '@/server/cors';
import { getPublicRecruitmentSettings } from '@/server/recruitment/settings';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request);
  try {
    const settings = await getPublicRecruitmentSettings();
    return jsonOk({ settings }, { headers });
  } catch (error) {
    const response = jsonFail(error);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
