import { NextRequest } from 'next/server';
import { jsonFail, jsonOk } from '@/server/api';
import { listPublishedJobs } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
    return jsonOk(result);
  } catch (error) {
    return jsonFail(error);
  }
}
