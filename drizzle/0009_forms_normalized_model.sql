-- Normalized forms model. form_documents remains the compatibility/read model for the legacy HTML client.
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  full_name text not null, email text, phone text, status text not null default 'active',
  employee_id uuid references public.employees(id), created_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists candidates_org_name_idx on public.candidates(organization_id, full_name);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  document_number text not null, form_template_id uuid references public.form_templates(id),
  employee_id uuid references public.employees(id), candidate_id uuid references public.candidates(id),
  branch_id uuid references public.branches(id), department_id uuid references public.departments(id),
  created_by uuid references public.users(id), employee_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'draft', current_approval_step integer not null default 0,
  submitted_at timestamptz, approved_at timestamptz, rejected_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, document_number)
);
create index if not exists form_submissions_employee_idx on public.form_submissions(organization_id, employee_id, updated_at desc);
create index if not exists form_submissions_status_idx on public.form_submissions(organization_id, status, updated_at desc);

create table if not exists public.form_submission_values (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.form_submissions(id) on delete cascade,
  field_id text, field_key text not null, value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (submission_id, field_key)
);
create index if not exists form_submission_values_key_idx on public.form_submission_values(field_key);
create table if not exists public.form_submission_items (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.form_submissions(id) on delete cascade,
  item_key text not null, position integer not null default 0, value jsonb not null default '{}'::jsonb,
  unique (submission_id, item_key, position)
);
create table if not exists public.form_comments (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.form_submissions(id) on delete cascade,
  user_id uuid not null references public.users(id), body text not null, created_at timestamptz not null default now()
);
create table if not exists public.form_signatures (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.form_submissions(id) on delete cascade,
  user_id uuid not null references public.users(id), action text not null, display_name text not null,
  comment text, signed_at timestamptz not null default now()
);
create table if not exists public.form_attachments (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.form_submissions(id) on delete cascade,
  file_name text not null, storage_key text not null, mime_type text, size_bytes bigint, uploaded_by uuid references public.users(id), created_at timestamptz not null default now()
);

-- Backfill the normalized record once; repeated deployments are idempotent.
insert into public.form_submissions(organization_id,document_number,form_template_id,employee_id,employee_snapshot,status,created_by,created_at,updated_at)
select d.organization_id,d.document_no,t.id,d.employee_id,coalesce(d.employee_snapshot,'{}'::jsonb),d.status,d.created_by,d.created_at,d.updated_at
from public.form_documents d left join public.form_templates t on t.organization_id=d.organization_id and t.template_key=d.form_type
on conflict(organization_id,document_number) do nothing;
