import { z } from 'zod';
import { jsonFail, jsonOk } from '@/server/api';
import { requireUser } from '@/server/context';
import { getJobForAdmin, updateJob } from '@/server/recruitment/jobs';

export const dynamic = 'force-dynamic';

const jobUpdateSchema = z.object({
  title_ar: z.string().trim().min(2).max(200).optional(),
  title_en: z.string().trim().max(200).nullable().optional(),
  slug: z.string().trim().max(200).optional(),
  department_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'temporary']).optional(),
  workplace_type: z.enum(['onsite', 'remote', 'hybrid']).optional(),
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
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const job = await getJobForAdmin(context, id);
    return jsonOk({ job });
  } catch (error) {
    return jsonFail(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireUser();
    const { id } = await params;
    const value = jobUpdateSchema.parse(await request.json());
    const job = await updateJob(context, id, {
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
    });
    return jsonOk({ job });
  } catch (error) {
    return jsonFail(error);
  }
}
