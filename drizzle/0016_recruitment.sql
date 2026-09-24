create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  title_ar text not null,
  title_en text,
  slug text not null,
  department_id uuid references public.departments(id),
  branch_id uuid references public.branches(id),
  employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract','temporary')),
  workplace_type text not null default 'onsite' check (workplace_type in ('onsite','remote','hybrid')),
  experience_min integer,
  experience_max integer,
  description text,
  responsibilities text,
  requirements text,
  benefits text,
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  salary_visible boolean not null default false,
  vacancies_count integer not null default 1,
  status text not null default 'draft' check (status in ('draft','scheduled','published','paused','closed','archived')),
  publish_at timestamptz,
  expires_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_org_slug_uq unique (organization_id, slug)
);

create index if not exists jobs_org_status_idx on public.jobs(organization_id, status, updated_at desc);
create index if not exists jobs_department_idx on public.jobs(department_id) where department_id is not null;
create index if not exists jobs_branch_idx on public.jobs(branch_id) where branch_id is not null;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  reference_number text,
  job_id uuid references public.jobs(id),
  full_name text not null,
  email text not null,
  phone text not null,
  city text,
  years_experience integer,
  linkedin_url text,
  cover_letter text,
  cv_file_url text not null,
  cv_file_name text not null,
  cv_mime_type text not null,
  cv_file_size bigint not null,
  cv_storage_key text not null,
  status text not null default 'new' check (status in (
    'new','reviewing','shortlisted','interview','second_interview',
    'offer','hired','rejected','withdrawn','archived'
  )),
  source text not null default 'website',
  consent boolean not null default false,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_applications_reference_number_uq unique (reference_number)
);

create index if not exists job_applications_org_status_idx on public.job_applications(organization_id, status, created_at desc);
create index if not exists job_applications_job_idx on public.job_applications(job_id) where job_id is not null;
create index if not exists job_applications_email_job_idx on public.job_applications(email, job_id, created_at desc);

create table if not exists public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.users(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists application_status_history_application_idx on public.application_status_history(application_id, created_at desc);

create table if not exists public.application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  user_id uuid not null references public.users(id),
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists application_notes_application_idx on public.application_notes(application_id, created_at desc);

insert into public.permissions(code,name_ar,description)
values
 ('recruitment.jobs.view','عرض الوظائف الشاغرة','عرض قائمة الوظائف في لوحة الإدارة'),
 ('recruitment.jobs.manage','إدارة الوظائف الشاغرة','إنشاء وتعديل ونشر وأرشفة الوظائف'),
 ('recruitment.applications.view','عرض طلبات التوظيف','عرض قائمة المتقدمين وملفاتهم'),
 ('recruitment.applications.manage','إدارة طلبات التوظيف','تغيير حالة الطلب وإضافة ملاحظات')
on conflict(code) do update set name_ar=excluded.name_ar,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in ('super_admin','hr_admin') and p.code like 'recruitment.%'
on conflict do nothing;
