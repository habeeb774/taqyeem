import { pool } from '@/db';
import { must, type SecurityContext } from '@/db/queries/security';
import { withNeonTransaction } from '@/lib/neon/admin';
import { sendApplicationReceivedEmail, sendNewApplicationHrNotification } from '@/server/recruitment-email';
import { uploadCv } from '@/server/recruitment-storage';
import { resolveDefaultOrganizationId } from './org';

export type ApplicationInput = {
  jobId?: string | null;
  fullName: string;
  email: string;
  phone: string;
  city?: string | null;
  yearsExperience?: number | null;
  linkedinUrl?: string | null;
  coverLetter?: string | null;
  consent: boolean;
};

const DUPLICATE_WINDOW_DAYS = 30;

export async function createApplication(input: ApplicationInput, cvFile: File) {
  if (!input.consent) throw Object.assign(new Error('CONSENT_REQUIRED'), { status: 400 });

  const organizationId = await resolveDefaultOrganizationId();

  if (input.jobId) {
    const job = await pool.query(
      `select 1 from public.jobs where id=$1::uuid and organization_id=$2::uuid and status='published'
         and (expires_at is null or expires_at > now()) limit 1`,
      [input.jobId, organizationId],
    );
    if (!job.rows[0]) throw Object.assign(new Error('JOB_NOT_AVAILABLE'), { status: 404 });
  }

  const duplicate = await pool.query(
    `select 1 from public.job_applications
     where organization_id=$1::uuid and lower(email)=lower($2)
       and job_id is not distinct from $3::uuid
       and created_at >= now() - interval '${DUPLICATE_WINDOW_DAYS} days'
     limit 1`,
    [organizationId, input.email, input.jobId || null],
  );
  if (duplicate.rows[0]) throw Object.assign(new Error('DUPLICATE_APPLICATION'), { status: 409 });

  const cv = await uploadCv(cvFile, organizationId);

  return withNeonTransaction(async (client) => {
    const inserted = await client.query(
      `
        insert into public.job_applications(
          organization_id,job_id,full_name,email,phone,city,years_experience,linkedin_url,cover_letter,
          cv_file_url,cv_file_name,cv_mime_type,cv_file_size,cv_storage_key,consent,consent_at
        ) values($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,'',$10,$11,$12,$13,true,now())
        returning *
      `,
      [
        organizationId, input.jobId || null, input.fullName, input.email, input.phone,
        input.city || null, input.yearsExperience ?? null, input.linkedinUrl || null, input.coverLetter || null,
        cv.fileName, cv.mimeType, cv.size, cv.key,
      ],
    );
    const application = inserted.rows[0];
    const year = new Date().getUTCFullYear();
    const yearlySeq = await client.query(
      `select count(*)::int c from public.job_applications where organization_id=$1::uuid and created_at >= date_trunc('year', now())`,
      [organizationId],
    );
    const referenceNumber = `SWD-${year}-${String(yearlySeq.rows[0].c).padStart(6, '0')}`;
    const cvUrl = `/api/app/applications/${application.id}/cv`;

    const updated = await client.query(
      `update public.job_applications set reference_number=$2, cv_file_url=$3, updated_at=now()
       where id=$1::uuid returning *`,
      [application.id, referenceNumber, cvUrl],
    );

    await client.query(
      `insert into public.application_status_history(application_id,old_status,new_status,note)
       values($1::uuid,null,'new','تم استلام الطلب')`,
      [application.id],
    );
    await client.query(
      `insert into public.audit_logs(organization_id,action,entity_type,entity_id,new_values)
       values($1::uuid,'application.create','job_application',$2::uuid,$3::jsonb)`,
      [organizationId, application.id, JSON.stringify({ reference_number: referenceNumber, job_id: input.jobId || null })],
    );

    return updated.rows[0];
  }).then(async (application) => {
    let jobTitle: string | null = null;
    if (application.job_id) {
      const job = await pool.query(`select title_ar from public.jobs where id=$1::uuid limit 1`, [application.job_id]);
      jobTitle = job.rows[0]?.title_ar || null;
    }
    await Promise.all([
      sendApplicationReceivedEmail(application.email, application.full_name, application.reference_number),
      sendNewApplicationHrNotification(application.full_name, application.reference_number, jobTitle, application.id),
    ]);
    return application;
  });
}

export async function listApplicationsForAdmin(
  context: SecurityContext,
  options: { search?: string; status?: string; jobId?: string; limit?: number; offset?: number } = {},
) {
  must(context, 'recruitment.applications.view');
  const search = options.search?.trim() || '';
  const limit = Math.min(100, Math.max(1, options.limit || 25));
  const offset = Math.max(0, options.offset || 0);

  const result = await pool.query(
    `
      select a.id, a.reference_number, a.full_name, a.email, a.phone, a.city, a.years_experience,
             a.status, a.created_at, j.title_ar job_title, j.id job_id, d.name department_name,
             count(*) over()::int total_count
      from public.job_applications a
      left join public.jobs j on j.id = a.job_id
      left join public.departments d on d.id = j.department_id
      where a.organization_id = $1::uuid
        and ($2 = '' or a.full_name ilike '%'||$2||'%' or a.phone ilike '%'||$2||'%'
             or a.email ilike '%'||$2||'%' or a.reference_number ilike '%'||$2||'%'
             or coalesce(j.title_ar,'') ilike '%'||$2||'%')
        and ($3 = '' or a.status = $3)
        and ($4::uuid is null or a.job_id = $4::uuid)
      order by a.created_at desc
      limit $5 offset $6
    `,
    [context.organizationId, search, options.status || '', options.jobId || null, limit, offset],
  );
  const total = Number(result.rows[0]?.total_count || 0);
  return {
    applications: result.rows.map(({ total_count: _totalCount, ...row }) => row),
    pagination: { total, limit, offset, hasMore: offset + result.rows.length < total },
  };
}

export async function getApplicationForAdmin(context: SecurityContext, id: string) {
  must(context, 'recruitment.applications.view');

  const application = await pool.query(
    `
      select a.*, j.title_ar job_title, j.id job_id, d.name department_name
      from public.job_applications a
      left join public.jobs j on j.id = a.job_id
      left join public.departments d on d.id = j.department_id
      where a.id=$1::uuid and a.organization_id=$2::uuid limit 1
    `,
    [id, context.organizationId],
  );
  if (!application.rows[0]) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  const [history, notes] = await Promise.all([
    pool.query(
      `select h.*, u.name changed_by_name from public.application_status_history h
       left join public.users u on u.id = h.changed_by
       where h.application_id=$1::uuid order by h.created_at desc`,
      [id],
    ),
    pool.query(
      `select n.*, u.name user_name from public.application_notes n
       join public.users u on u.id = n.user_id
       where n.application_id=$1::uuid order by n.created_at desc`,
      [id],
    ),
  ]);

  return { application: application.rows[0], history: history.rows, notes: notes.rows };
}

const applicationStatuses = [
  'new', 'reviewing', 'shortlisted', 'interview', 'second_interview',
  'offer', 'hired', 'rejected', 'withdrawn', 'archived',
] as const;

export async function changeApplicationStatus(
  context: SecurityContext,
  id: string,
  newStatus: (typeof applicationStatuses)[number],
  note?: string | null,
) {
  must(context, 'recruitment.applications.manage');

  return withNeonTransaction(async (client) => {
    const existing = await client.query(
      `select * from public.job_applications where id=$1::uuid and organization_id=$2::uuid for update`,
      [id, context.organizationId],
    );
    if (!existing.rows[0]) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const updated = await client.query(
      `update public.job_applications set status=$3, updated_at=now() where id=$1::uuid and organization_id=$2::uuid returning *`,
      [id, context.organizationId, newStatus],
    );
    await client.query(
      `insert into public.application_status_history(application_id,old_status,new_status,changed_by,note)
       values($1::uuid,$2,$3,$4::uuid,$5)`,
      [id, existing.rows[0].status, newStatus, context.user.id, note || null],
    );
    await client.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values)
       values($1::uuid,$2::uuid,'application.status_change','job_application',$3::uuid,$4::jsonb,$5::jsonb)`,
      [context.organizationId, context.user.id, id, JSON.stringify({ status: existing.rows[0].status }), JSON.stringify({ status: newStatus })],
    );
    return updated.rows[0];
  });
}

export async function addApplicationNote(context: SecurityContext, id: string, note: string) {
  must(context, 'recruitment.applications.manage');
  return withNeonTransaction(async (client) => {
    const exists = await client.query(
      `select 1 from public.job_applications where id=$1::uuid and organization_id=$2::uuid`,
      [id, context.organizationId],
    );
    if (!exists.rows[0]) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

    const inserted = await client.query(
      `insert into public.application_notes(application_id,user_id,note) values($1::uuid,$2::uuid,$3) returning *`,
      [id, context.user.id, note],
    );
    await client.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id)
       values($1::uuid,$2::uuid,'application.note_add','job_application',$3::uuid)`,
      [context.organizationId, context.user.id, id],
    );
    return inserted.rows[0];
  });
}

export async function getApplicationCvForAdmin(context: SecurityContext, id: string) {
  must(context, 'recruitment.applications.view');
  const result = await pool.query(
    `select cv_storage_key, cv_file_name from public.job_applications where id=$1::uuid and organization_id=$2::uuid limit 1`,
    [id, context.organizationId],
  );
  if (!result.rows[0]) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

  await pool.query(
    `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id)
     values($1::uuid,$2::uuid,'application.cv_view','job_application',$3::uuid)`,
    [context.organizationId, context.user.id, id],
  );

  return result.rows[0];
}
