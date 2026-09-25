import { NextRequest, NextResponse } from 'next/server';
import { jsonFail, jsonOk } from '@/server/api';
import { corsHeaders } from '@/server/cors';
import { listPublishedJobs } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: NextRequest) {
  // Public, non-personalized listing consumed by anonymous visitors on the
  // careers site; short-lived shared cache cuts DB load without staling an
  // admin's just-published job for more than half a minute.
  const headers = { ...corsHeaders(request), 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' };
  try {
    const query = request.nextUrl.searchParams;
    const result = await listPublishedJobs({
      search: query.get('q') || '',
      departmentId: query.get('department_id') || null,
      branchId: query.get('branch_id') || null,
      employmentType: query.get('employment_type') || null,
      workplaceType: query.get('workplace_type') || null,
      minExperience: query.get('min_experience') ? Number(query.get('min_experience')) : null,
      sort: query.get('sort') === 'oldest' ? 'oldest' : 'newest',
      limit: Number(query.get('limit') || 12),
      offset: Number(query.get('offset') || 0),
    });
    return jsonOk(result, { headers });
  } catch (error) {
    const response = jsonFail(error);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
