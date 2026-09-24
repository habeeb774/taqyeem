import { NextRequest, NextResponse } from 'next/server';
import { jsonFail, jsonOk } from '@/server/api';
import { corsHeaders } from '@/server/cors';
import { checkRateLimit, clientIp } from '@/server/rate-limit';
import { trackApplication } from '@/server/recruitment/applications';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request);
  try {
    if (checkRateLimit(`application-track:${clientIp(request)}`, 20, 15 * 60 * 1000)) {
      throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
    }

    const query = request.nextUrl.searchParams;
    const referenceNumber = (query.get('reference_number') || '').trim();
    const email = (query.get('email') || '').trim();
    if (!referenceNumber || !email) {
      throw Object.assign(new Error('REQUEST_FAILED'), { status: 400 });
    }
    const application = await trackApplication(referenceNumber, email);
    return jsonOk({ application }, { headers });
  } catch (error) {
    const response = jsonFail(error);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
