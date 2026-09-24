import { randomUUID } from 'node:crypto';
import { pool } from '@/db';
import { must, type SecurityContext } from '@/db/queries/security';
import { withNeonTransaction } from '@/lib/neon/admin';
import { resolveDefaultOrganizationId } from './org';

export type PublicJobFilters = {
  search?: string;
  departmentId?: string | null;
  branchId?: string | null;
  employmentType?: string | null;
  workplaceType?: string | null;
  minExperience?: number | null;
  limit?: number;
  offset?: number;
  sort?: 'newest' | 'oldest';
};

export type JobInput = {
  titleAr: string;
  titleEn?: string | null;
  slug: string;
  departmentId?: string | null;
  branchId?: string | null;
  employmentType: string;
  workplaceType: string;
  experienceMin?: number | null;
  experienceMax?: number | null;
  description?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryVisible?: boolean;
  vacanciesCount?: number;
  expiresAt?: string | null;
  externalApplyUrl?: string | null;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120) || randomUUID().slice(0, 8);
}

export async function listPublishedJobs(filters: PublicJobFilters = {}) {
  const organizationId = await resolveDefaultOrganizationId();
  const search = filters.search?.trim() || '';
  const limit = Math.min(50, Math.max(1, filters.limit || 12));
  const offset = Math.max(0, filters.offset || 0);
  const order = filters.sort === 'oldest' ? 'asc' : 'desc';

  const result = await pool.query(
    `
      select j.id, j.title_ar, j.title_en, j.slug, j.employment_type, j.workplace_type,
             j.experience_min, j.experience_max, j.salary_min, j.salary_max, j.salary_visible,
             j.vacancies_count, j.publish_at, j.expires_at, j.created_at,
             d.name department_name, b.name branch_name, b.city branch_city,
             count(*) over()::int total_count
      from public.jobs j
      left join public.departments d on d.id = j.department_id
      left join public.branches b on b.id = j.branch_id
      where j.organization_id = $1::uuid
        and j.status = 'published'
        and (j.expires_at is null or j.expires_at > now())
        and ($2 = '' or j.title_ar ilike '%'||$2||'%' or j.title_en ilike '%'||$2||'%')
        and ($3::uuid is null or j.department_id = $3::uuid)
        and ($4::uuid is null or j.branch_id = $4::uuid)
        and ($5 = '' or j.employment_type = $5)
        and ($6 = '' or j.workplace_type = $6)
        and ($7::int is null or coalesce(j.experience_min,0) <= $7::int)
      order by j.created_at ${order}
      limit $8 offset $9
    `,
    [
      organizationId,
      search,
      filters.departmentId || null,
      filters.branchId || null,
      filters.employmentType || '',
      filters.workplaceType || '',
      filters.minExperience ?? null,
      limit,
      offset,
    ],
  );

  const total = Number(result.rows[0]?.total_count || 0);
  return {
    jobs: result.rows.map(({ total_count: _totalCount, ...row }) => row),
    pagination: { total, limit, offset, hasMore: offset + result.rows.length < total },
  };
}

export async function getPublishedJobBySlug(slug: string) {
  const organizationId = await resolveDefaultOrganizationId();
  const result = await pool.query(
    `
      select j.*, d.name department_name, b.name branch_name, b.city branch_city
      from public.jobs j
      left join public.departments d on d.id = j.department_id
      left join public.branches b on b.id = j.branch_id
      where j.organization_id = $1::uuid
        and j.slug = $2
        and j.status = 'published'
        and (j.expires_at is null or j.expires_at > now())
      limit 1
    `,
    [organizationId, slug],
  );
  return result.rows[0] || null;
}

export async function listJobsForAdmin(
  context: SecurityContext,
  options: { search?: string; status?: string; limit?: number; offset?: number } = {},
) {
  must(context, 'recruitment.jobs.view');
  const search = options.search?.trim() || '';
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const offset = Math.max(0, options.offset || 0);

  const result = await pool.query(
    `
      select j.*, d.name department_name, b.name branch_name,
             (select count(*) from public.job_applications a where a.job_id = j.id)::int applications_count,
             count(*) over()::int total_count
      from public.jobs j
      left join public.departments d on d.id = j.department_id
      left join public.branches b on b.id = j.branch_id
      where j.organization_id = $1::uuid
        and ($2 = '' or j.title_ar ilike '%'||$2||'%' or j.title_en ilike '%'||$2||'%')
        and ($3 = '' or j.status = $3)
      order by j.updated_at desc
      limit $4 offset $5
    `,
    [context.organizationId, search, options.status || '', limit, offset],
  );
  const total = Number(result.rows[0]?.total_count || 0);
  return {
    jobs: result.rows.map(({ total_count: _totalCount, ...row }) => row),
    pagination: { total, limit, offset, hasMore: offset + result.rows.length < total },
  };
}

export async function getJobForAdmin(context: SecurityContext, id: string) {
  must(context, 'recruitment.jobs.view');
  const result = await pool.query(
    `select * from public.jobs where id=$1::uuid and organization_id=$2::uuid limit 1`,
    [id, context.organizationId],
  );
  if (!result.rows[0]) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
  return result.rows[0];
}

async function assertUniqueSlug(organizationId: string, slug: string, excludeId?: string) {
  const result = await pool.query(
    `select 1 from public.jobs where organization_id=$1::uuid and slug=$2 and id <> coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid) limit 1`,
    [organizationId, slug, excludeId || null],
  );
  if (result.rows[0]) throw Object.assign(new Error('SLUG_ALREADY_EXISTS'), { status: 409 });
}

export async function createJob(context: SecurityContext, input: JobInput) {
  must(context, 'recruitment.jobs.manage');
  const slug = slugify(input.slug || input.titleAr);
  await assertUniqueSlug(context.organizationId, slug);

  return withNeonTransaction(async (client) => {
    const result = await client.query(
      `
        insert into public.jobs(
          organization_id,title_ar,title_en,slug,department_id,branch_id,employment_type,workplace_type,
          experience_min,experience_max,description,responsibilities,requirements,benefits,
          salary_min,salary_max,salary_visible,vacancies_count,expires_at,external_apply_url,created_by
        ) values(
          $1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::timestamptz,$20,$21::uuid
        ) returning *
      `,
      [
        context.organizationId, input.titleAr, input.titleEn || null, slug,
        input.departmentId || null, input.branchId || null, input.employmentType, input.workplaceType,
        input.experienceMin ?? null, input.experienceMax ?? null, input.description || null,
        input.responsibilities || null, input.requirements || null, input.benefits || null,
        input.salaryMin ?? null, input.salaryMax ?? null, input.salaryVisible ?? false,
        input.vacanciesCount || 1, input.expiresAt || null, input.externalApplyUrl || null, context.user.id,
      ],
    );
    await client.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
       values($1::uuid,$2::uuid,'job.create','job',$3::uuid,$4::jsonb)`,
      [context.organizationId, context.user.id, result.rows[0].id, JSON.stringify({ title_ar: input.titleAr, slug })],
    );
    return result.rows[0];
  });
}

export async function updateJob(context: SecurityContext, id: string, input: Partial<JobInput>) {
  must(context, 'recruitment.jobs.manage');
  const existing = await getJobForAdmin(context, id);

  let slug = existing.slug;
  if (input.slug && input.slug !== existing.slug) {
    slug = slugify(input.slug);
    await assertUniqueSlug(context.organizationId, slug, id);
  }

  return withNeonTransaction(async (client) => {
    const result = await client.query(
      `
        update public.jobs set
          title_ar = $3, title_en = $4, slug = $5, department_id = $6::uuid, branch_id = $7::uuid,
          employment_type = $8, workplace_type = $9, experience_min = $10, experience_max = $11,
          description = $12, responsibilities = $13, requirements = $14, benefits = $15,
          salary_min = $16, salary_max = $17, salary_visible = $18, vacancies_count = $19,
          expires_at = $20::timestamptz, external_apply_url = $21, updated_at = now()
        where id = $1::uuid and organization_id = $2::uuid
        returning *
      `,
      [
        id, context.organizationId,
        input.titleAr ?? existing.title_ar, input.titleEn ?? existing.title_en, slug,
        input.departmentId ?? existing.department_id, input.branchId ?? existing.branch_id,
        input.employmentType ?? existing.employment_type, input.workplaceType ?? existing.workplace_type,
        input.experienceMin ?? existing.experience_min, input.experienceMax ?? existing.experience_max,
        input.description ?? existing.description, input.responsibilities ?? existing.responsibilities,
        input.requirements ?? existing.requirements, input.benefits ?? existing.benefits,
        input.salaryMin ?? existing.salary_min, input.salaryMax ?? existing.salary_max,
        input.salaryVisible ?? existing.salary_visible, input.vacanciesCount ?? existing.vacancies_count,
        input.expiresAt ?? existing.expires_at, input.externalApplyUrl ?? existing.external_apply_url,
      ],
    );
    await client.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values)
       values($1::uuid,$2::uuid,'job.update','job',$3::uuid,$4::jsonb,$5::jsonb)`,
      [context.organizationId, context.user.id, id, JSON.stringify({ status: existing.status }), JSON.stringify({ updated: true })],
    );
    return result.rows[0];
  });
}

const jobStatuses = ['draft', 'scheduled', 'published', 'paused', 'closed', 'archived'] as const;

export async function changeJobStatus(context: SecurityContext, id: string, status: (typeof jobStatuses)[number], publishAt?: string | null) {
  must(context, 'recruitment.jobs.manage');
  const existing = await getJobForAdmin(context, id);

  return withNeonTransaction(async (client) => {
    const result = await client.query(
      `update public.jobs set status=$3, publish_at=$4::timestamptz, updated_at=now()
       where id=$1::uuid and organization_id=$2::uuid returning *`,
      [id, context.organizationId, status, publishAt || null],
    );
    await client.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values)
       values($1::uuid,$2::uuid,'job.status_change','job',$3::uuid,$4::jsonb,$5::jsonb)`,
      [context.organizationId, context.user.id, id, JSON.stringify({ status: existing.status }), JSON.stringify({ status })],
    );
    return result.rows[0];
  });
}

export async function duplicateJob(context: SecurityContext, id: string) {
  must(context, 'recruitment.jobs.manage');
  const existing = await getJobForAdmin(context, id);
  const slug = slugify(`${existing.slug}-${randomUUID().slice(0, 6)}`);

  return createJob(context, {
    titleAr: existing.title_ar,
    titleEn: existing.title_en,
    slug,
    departmentId: existing.department_id,
    branchId: existing.branch_id,
    employmentType: existing.employment_type,
    workplaceType: existing.workplace_type,
    experienceMin: existing.experience_min,
    experienceMax: existing.experience_max,
    description: existing.description,
    responsibilities: existing.responsibilities,
    requirements: existing.requirements,
    benefits: existing.benefits,
    salaryMin: existing.salary_min,
    salaryMax: existing.salary_max,
    salaryVisible: existing.salary_visible,
    vacanciesCount: existing.vacancies_count,
    externalApplyUrl: existing.external_apply_url,
  });
}

export async function getRecruitmentDashboard(context: SecurityContext) {
  must(context, 'recruitment.jobs.view');
  const result = await pool.query(
    `
      select
        (select count(*) from public.jobs where organization_id=$1::uuid and status='published')::int active_jobs,
        (select count(*) from public.job_applications where organization_id=$1::uuid)::int total_applications,
        (select count(*) from public.job_applications where organization_id=$1::uuid and created_at >= date_trunc('day', now()))::int today_applications,
        (select count(*) from public.job_applications where organization_id=$1::uuid and created_at >= date_trunc('week', now()))::int week_applications,
        (select count(*) from public.job_applications where organization_id=$1::uuid and created_at >= date_trunc('month', now()))::int month_applications,
        (select count(*) from public.job_applications where organization_id=$1::uuid and status='hired')::int hired_applications,
        (select count(*) from public.job_applications where organization_id=$1::uuid and status='rejected')::int rejected_applications,
        (select count(*) from public.job_applications where organization_id=$1::uuid and status in ('new','reviewing','shortlisted','interview','second_interview'))::int in_review_applications
    `,
    [context.organizationId],
  );
  return result.rows[0];
}
