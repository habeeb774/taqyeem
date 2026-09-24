import { NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { createJob, listJobsForAdmin } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

const jobSchema = z.object({
  title_ar: z.string().trim().min(2).max(200),
  title_en: z.string().trim().max(200).nullable().optional(),
  slug: z.string().trim().max(200),
  department_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'temporary']),
  workplace_type: z.enum(['onsite', 'remote', 'hybrid']),
  experience_min: z.coerce.number().int().min(0).max(60).nullable().optional(),
  experience_max: z.coerce.number().int().min(0).max(60).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  responsibilities: z.string().max(8000).nullable().optional(),
  requirements: z.string().max(8000).nullable().optional(),
  benefits: z.string().max(8000).nullable().optional(),
  salary_min: z.coerce.number().min(0).nullable().optional(),
  salary_max: z.coerce.number().min(0).nullable().optional(),
  salary_visible: z.coerce.boolean().optional(),
  vacancies_count: z.coerce.number().int().min(1).max(500).optional(),
  expires_at: z.string().nullable().optional(),
  external_apply_url: z.string().trim().url().max(500).nullable().optional().or(z.literal('')),
});

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser();
    const query = request.nextUrl.searchParams;
    const result = await listJobsForAdmin(context, {
      search: query.get('q') || '',
      status: query.get('status') || '',
      limit: Number(query.get('limit') || 25),
      offset: Number(query.get('offset') || 0),
    });
    return jsonOk(result);
  } catch (error) {
    return jsonFail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireUser();
    const value = jobSchema.parse(await request.json());
    const job = await createJob(context, {
      titleAr: value.title_ar,
      titleEn: value.title_en,
      slug: value.slug,
      departmentId: value.department_id,
      branchId: value.branch_id,
      employmentType: value.employment_type,
      workplaceType: value.workplace_type,
      experienceMin: value.experience_min,
      experienceMax: value.experience_max,
      description: value.description,
      responsibilities: value.responsibilities,
      requirements: value.requirements,
      benefits: value.benefits,
      salaryMin: value.salary_min,
      salaryMax: value.salary_max,
      salaryVisible: value.salary_visible,
      vacanciesCount: value.vacancies_count,
      expiresAt: value.expires_at,
      externalApplyUrl: value.external_apply_url || null,
    });
    return jsonOk({ job });
  } catch (error) {
    return jsonFail(error);
  }
}
