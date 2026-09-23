-- Searchable HR domain records derived from approved/issued form submissions.
create table if not exists public.employee_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  source_submission_id uuid not null references public.form_submissions(id),
  item_position integer not null,
  asset_name text not null,
  quantity numeric(14,3) not null default 1,
  asset_value numeric(14,2),
  condition_on_delivery text,
  notes text,
  status text not null default 'assigned' check (status in ('assigned','returned','lost','damaged')),
  assigned_at date,
  returned_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_submission_id,item_position)
);
create index if not exists employee_assets_employee_status_idx on public.employee_assets(organization_id,employee_id,status);

create table if not exists public.employee_asset_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  asset_id uuid not null references public.employee_assets(id) on delete cascade,
  event_type text not null check (event_type in ('assigned','returned','lost','damaged','maintenance')),
  event_date date,
  condition text,
  notes text,
  source_submission_id uuid references public.form_submissions(id),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists employee_asset_events_asset_idx on public.employee_asset_events(asset_id,created_at desc);

create table if not exists public.employee_violations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  source_submission_id uuid not null unique references public.form_submissions(id),
  violation_date date,
  violation_type text,
  penalty text,
  description text,
  manager_name text,
  status text not null default 'recorded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_violations_employee_date_idx on public.employee_violations(organization_id,employee_id,violation_date desc);

create table if not exists public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  source_submission_id uuid not null unique references public.form_submissions(id),
  request_date date,
  request_type text,
  amount numeric(14,2),
  installment_count integer,
  payment_method text,
  reason text,
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_advances_employee_date_idx on public.employee_advances(organization_id,employee_id,request_date desc);

create table if not exists public.employee_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  employee_id uuid not null references public.employees(id),
  source_submission_id uuid not null unique references public.form_submissions(id),
  period_from date,
  period_to date,
  tasks jsonb not null default '[]'::jsonb,
  highlights text,
  next_plan text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_monthly_reports_employee_period_idx on public.employee_monthly_reports(organization_id,employee_id,period_from desc);

create index if not exists form_documents_archive_search_idx on public.form_documents(organization_id,updated_at desc) where deleted_at is null;
create index if not exists form_documents_creator_idx on public.form_documents(organization_id,created_by,updated_at desc) where deleted_at is null;
