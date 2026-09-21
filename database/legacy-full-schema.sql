
-- ===== BEGIN neon/migrations/0000_supabase_auth_compat.sql =====
-- Neon compatibility layer while Supabase Auth remains the identity provider.
-- Run after enabling Neon Data API with Supabase's JWKS as an external auth provider.

create schema if not exists auth;

-- Auth.js owns application identities in public.users.
-- The auth schema below is retained only as a compatibility namespace for legacy RLS helper functions;
-- there is no auth.users table and no Neon Auth identity dependency.

-- Keep existing Supabase-style RLS helpers working. Neon Data API exposes
-- auth.user_id() from the verified JWT. The dynamic call keeps migration
-- parsing robust if the Data API extension is provisioned immediately after DB creation.
create or replace function auth.uid()
returns uuid
language plpgsql
stable
as $$
declare
  v text;
begin
  begin
    execute 'select auth.user_id()::text' into v;
  exception when undefined_function then
    return null;
  end;
  return nullif(v, '')::uuid;
end;
$$;

-- Neon Data API normally provisions these roles. Creating them conditionally
-- makes local/admin migration runs deterministic.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;
end
$$;

-- ===== END neon/migrations/0000_supabase_auth_compat.sql =====

-- ===== BEGIN supabase/migrations/0001_initial_schema.sql =====
-- 0001_initial_schema.sql
-- Core PostgreSQL schema for the employee performance HRMS.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.employee_status as enum ('active','leave','suspended','resigned','transferred','terminated');
create type public.employment_type as enum ('full_time','part_time','contractor','temporary','intern','other');
create type public.cycle_status as enum ('draft','open','in_progress','review','approved','published','locked');
create type public.evaluation_status as enum ('draft','submitted','reviewed','approved','published','locked');
create type public.evaluation_type as enum ('performance','sales_target','attendance');
create type public.scope_type as enum ('organization','branch','department','assigned_employees');
create type public.template_scope_type as enum ('general','job_title','department','employee');
create type public.exclusion_type as enum ('leave','other_branch','other_manager','transferred','not_required','temporarily_suspended','other');
create type public.target_source as enum ('individual','branch_share','manual');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text,
  organization_id uuid references public.organizations(id) on delete restrict,
  employee_id uuid,
  active boolean not null default true,
  email_verified timestamptz,
  image text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references public.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  employee_id uuid unique,
  full_name text,
  email text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name_ar text not null,
  description text,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role_id, organization_id)
);

create table public.role_scopes (
  id uuid primary key default gen_random_uuid(),
  user_role_id uuid not null references public.user_roles(id) on delete cascade,
  scope_type public.scope_type not null,
  scope_id uuid,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_role_id, scope_type, scope_id),
  check ((scope_type in ('organization','assigned_employees') and scope_id is null) or
         (scope_type in ('branch','department') and scope_id is not null))
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  city text,
  address text,
  phone text,
  manager_employee_id uuid,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, name)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  parent_department_id uuid references public.departments(id) on delete restrict,
  name text not null,
  code text not null,
  manager_employee_id uuid,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique nulls not distinct (organization_id, branch_id, code)
);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  name text not null,
  code text not null,
  manager_employee_id uuid,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (department_id, code)
);

create table public.job_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_number text not null,
  full_name text not null,
  normalized_name text,
  photo_path text,
  email text,
  phone text,
  hire_date date,
  branch_id uuid references public.branches(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  section_id uuid references public.sections(id) on delete restrict,
  job_title_id uuid references public.job_titles(id) on delete restrict,
  manager_id uuid references public.employees(id) on delete restrict,
  supervisor_id uuid references public.employees(id) on delete restrict,
  employment_type public.employment_type not null default 'full_time',
  status public.employee_status not null default 'active',
  work_start_date date,
  work_end_date date,
  hr_notes text,
  legacy_source_id text,
  active boolean generated always as (status = 'active') stored,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, employee_number)
);

alter table public.profiles add constraint profiles_employee_fk foreign key (employee_id) references public.employees(id) on delete set null;
alter table public.branches add constraint branches_manager_fk foreign key (manager_employee_id) references public.employees(id) on delete set null;
alter table public.departments add constraint departments_manager_fk foreign key (manager_employee_id) references public.employees(id) on delete set null;
alter table public.sections add constraint sections_manager_fk foreign key (manager_employee_id) references public.employees(id) on delete set null;

create table public.employee_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  section_id uuid references public.sections(id) on delete restrict,
  job_title_id uuid references public.job_titles(id) on delete restrict,
  manager_id uuid references public.employees(id) on delete restrict,
  supervisor_id uuid references public.employees(id) on delete restrict,
  effective_from date not null default current_date,
  effective_to date,
  reason text,
  is_current boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index employee_assignments_one_current on public.employee_assignments(employee_id) where is_current;

create table public.employee_manager_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  old_manager_id uuid references public.employees(id) on delete set null,
  new_manager_id uuid references public.employees(id) on delete set null,
  reason text,
  effective_at timestamptz not null default now(),
  changed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.evaluation_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  month smallint not null check (month between 1 and 12),
  year smallint not null check (year between 2000 and 2200),
  starts_at date not null,
  ends_at date not null,
  status public.cycle_status not null default 'draft',
  opened_at timestamptz,
  published_at timestamptz,
  locked_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, year, month),
  check (ends_at >= starts_at)
);

create table public.evaluation_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  scope_type public.template_scope_type not null default 'general',
  scope_id uuid,
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_type = 'general' and scope_id is null) or (scope_type <> 'general' and scope_id is not null))
);
create unique index evaluation_templates_scope_unique on public.evaluation_templates(organization_id, scope_type, scope_id, version) where active;

create table public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  max_score numeric(6,2) not null default 5 check (max_score > 0),
  mandatory boolean not null default true,
  visible_to_employee boolean not null default true,
  comment_required boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.template_criteria (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.evaluation_templates(id) on delete cascade,
  criterion_id uuid not null references public.evaluation_criteria(id) on delete restrict,
  weight numeric(8,4) not null default 1 check (weight > 0),
  sort_order integer not null default 0,
  mandatory boolean not null default true,
  visible_to_employee boolean not null default true,
  comment_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (template_id, criterion_id),
  unique (template_id, sort_order)
);

create table public.employee_custom_criteria (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  criterion_id uuid not null references public.evaluation_criteria(id) on delete restrict,
  weight numeric(8,4) not null default 1 check (weight > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (employee_id, criterion_id)
);

create table public.evaluation_exclusions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  exclusion_type public.exclusion_type not null,
  reason text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

create table public.evaluation_assignments (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  evaluator_user_id uuid not null references public.users(id) on delete restrict,
  template_id uuid references public.evaluation_templates(id) on delete restrict,
  evaluation_type public.evaluation_type not null default 'performance',
  due_at timestamptz,
  assigned_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (cycle_id, employee_id, evaluator_user_id, evaluation_type)
);

create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.evaluation_assignments(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  evaluator_user_id uuid not null references public.users(id) on delete restrict,
  evaluation_type public.evaluation_type not null default 'performance',
  template_id uuid references public.evaluation_templates(id) on delete restrict,
  template_snapshot jsonb not null default '{}'::jsonb,
  status public.evaluation_status not null default 'draft',
  weighted_score numeric(8,3),
  final_score numeric(8,3),
  result_label text,
  notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  published_at timestamptz,
  published_by uuid references public.users(id),
  locked_at timestamptz,
  reopened_at timestamptz,
  reopened_by uuid references public.users(id),
  reopen_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, cycle_id, evaluator_user_id, evaluation_type)
);

create table public.evaluation_answers (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  criterion_id uuid references public.evaluation_criteria(id) on delete restrict,
  criterion_name_snapshot text not null,
  criterion_description_snapshot text,
  weight_snapshot numeric(8,4) not null default 1 check (weight_snapshot > 0),
  max_score_snapshot numeric(6,2) not null default 5 check (max_score_snapshot > 0),
  score numeric(6,2) not null check (score > 0),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, criterion_id)
);

create table public.evaluation_versions (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  reason text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (evaluation_id, version)
);

create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  department_id uuid references public.departments(id) on delete restrict,
  target_amount numeric(14,2) not null check (target_amount > 0),
  achieved_amount numeric(14,2) not null default 0 check (achieved_amount >= 0),
  source public.target_source not null default 'individual',
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  last_edit_reason text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

create table public.branch_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  target_amount numeric(14,2) not null check (target_amount > 0),
  achieved_amount numeric(14,2) not null default 0 check (achieved_amount >= 0),
  target_mode text not null default 'independent' check (target_mode in ('independent','sum_employee_targets')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, branch_id)
);

create table public.attendance_penalty_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  deduction_points numeric(8,2) not null check (deduction_points >= 0),
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.attendance_evaluations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.evaluation_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  base_score numeric(8,2) not null default 100 check (base_score >= 0),
  final_score numeric(8,2) not null default 100 check (final_score >= 0),
  notes text,
  status public.evaluation_status not null default 'draft',
  evaluator_user_id uuid not null references public.users(id) on delete restrict,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

create table public.attendance_penalty_entries (
  id uuid primary key default gen_random_uuid(),
  attendance_evaluation_id uuid not null references public.attendance_evaluations(id) on delete cascade,
  penalty_type_id uuid not null references public.attendance_penalty_types(id) on delete restrict,
  occurrences integer not null default 0 check (occurrences >= 0),
  deduction_points_snapshot numeric(8,2) not null check (deduction_points_snapshot >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_evaluation_id, penalty_type_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  kind text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  bucket text not null,
  path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value jsonb not null,
  description text,
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table public.login_attempts (
  id bigserial primary key,
  email_hash text not null,
  ip_address inet,
  success boolean not null default false,
  user_id uuid references public.users(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index employees_org_idx on public.employees(organization_id);
create index employees_branch_idx on public.employees(branch_id) where deleted_at is null;
create index employees_department_idx on public.employees(department_id) where deleted_at is null;
create index employees_job_title_idx on public.employees(job_title_id) where deleted_at is null;
create index employees_manager_idx on public.employees(manager_id) where deleted_at is null;
create index employees_name_trgm_idx on public.employees using gin (full_name gin_trgm_ops);
create index eval_cycles_org_status_idx on public.evaluation_cycles(organization_id,status,year,month);
create index eval_assignments_evaluator_idx on public.evaluation_assignments(evaluator_user_id,cycle_id);
create index evaluations_employee_cycle_idx on public.evaluations(employee_id,cycle_id,status);
create index evaluations_status_idx on public.evaluations(status,cycle_id);
create index sales_targets_cycle_idx on public.sales_targets(cycle_id,branch_id,department_id);
create index attendance_cycle_idx on public.attendance_evaluations(cycle_id,employee_id);
create index notifications_user_unread_idx on public.notifications(user_id,read_at,created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type,entity_id,created_at desc);
create index audit_logs_user_idx on public.audit_logs(user_id,created_at desc);
create index login_attempts_rate_idx on public.login_attempts(email_hash,ip_address,created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger set_branches_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger set_departments_updated_at before update on public.departments for each row execute function public.set_updated_at();
create trigger set_sections_updated_at before update on public.sections for each row execute function public.set_updated_at();
create trigger set_job_titles_updated_at before update on public.job_titles for each row execute function public.set_updated_at();
create trigger set_employees_updated_at before update on public.employees for each row execute function public.set_updated_at();
create trigger set_cycles_updated_at before update on public.evaluation_cycles for each row execute function public.set_updated_at();
create trigger set_templates_updated_at before update on public.evaluation_templates for each row execute function public.set_updated_at();
create trigger set_criteria_updated_at before update on public.evaluation_criteria for each row execute function public.set_updated_at();
create trigger set_evaluations_updated_at before update on public.evaluations for each row execute function public.set_updated_at();
create trigger set_answers_updated_at before update on public.evaluation_answers for each row execute function public.set_updated_at();
create trigger set_sales_targets_updated_at before update on public.sales_targets for each row execute function public.set_updated_at();
create trigger set_branch_targets_updated_at before update on public.branch_targets for each row execute function public.set_updated_at();
create trigger set_attendance_penalty_types_updated_at before update on public.attendance_penalty_types for each row execute function public.set_updated_at();
create trigger set_attendance_evaluations_updated_at before update on public.attendance_evaluations for each row execute function public.set_updated_at();
create trigger set_attendance_entries_updated_at before update on public.attendance_penalty_entries for each row execute function public.set_updated_at();
create trigger set_settings_updated_at before update on public.system_settings for each row execute function public.set_updated_at();

-- Profiles are created explicitly by the Auth.js server routes.

-- ===== END supabase/migrations/0001_initial_schema.sql =====

-- ===== BEGIN supabase/migrations/0002_security_rbac_rls.sql =====
-- 0002_security_rbac_rls.sql
-- RBAC, scope helpers and Row Level Security.

insert into public.permissions(code,name_ar) values
('users.view','عرض المستخدمين'),('users.create','إنشاء المستخدمين'),('users.update','تعديل المستخدمين'),('users.delete','تعطيل/حذف المستخدمين'),
('roles.manage','إدارة الأدوار والصلاحيات'),
('employees.view','عرض الموظفين'),('employees.create','إضافة الموظفين'),('employees.update','تعديل الموظفين'),('employees.delete','تعطيل الموظفين'),
('branches.manage','إدارة الفروع'),('departments.manage','إدارة الإدارات'),('sections.manage','إدارة الأقسام'),('job_titles.manage','إدارة المسميات الوظيفية'),
('evaluations.view','عرض التقييمات'),('evaluations.create','إنشاء التقييمات'),('evaluations.edit','تعديل التقييمات'),('evaluations.submit','إرسال التقييمات'),
('evaluations.review','مراجعة التقييمات'),('evaluations.approve','اعتماد التقييمات'),('evaluations.publish','نشر التقييمات'),('evaluations.reopen','إعادة فتح التقييمات'),
('criteria.manage','إدارة معايير وقوالب التقييم'),
('targets.view','عرض الأهداف'),('targets.manage','إدارة الأهداف'),
('attendance.view','عرض تقييم الحضور'),('attendance.manage','إدارة تقييم الحضور والمخالفات'),
('reports.view','عرض التقارير'),('reports.export','تصدير التقارير'),
('settings.manage','إدارة إعدادات النظام'),('audit_logs.view','عرض سجل العمليات')
on conflict (code) do update set name_ar=excluded.name_ar;

insert into public.roles(organization_id,code,name_ar,description,is_system) values
(null,'super_admin','مدير النظام','كامل الصلاحيات داخل الشركة',true),
(null,'hr_admin','مدير الموارد البشرية','إدارة الموظفين ودورات التقييم والمراجعة والتقارير',true),
(null,'branch_manager','مدير فرع','صلاحيات ضمن فرع محدد',true),
(null,'department_manager','مدير إدارة','صلاحيات ضمن إدارة محددة',true),
(null,'supervisor','مشرف / مقيّم','تقييم الموظفين المسندين إليه',true),
(null,'employee','موظف','بوابة الموظف وتقييماته المنشورة',true),
(null,'auditor','مدقق / قارئ','قراءة التقارير وسجل العمليات بدون تعديل',true)
on conflict (organization_id,code) do update set name_ar=excluded.name_ar,description=excluded.description;

-- Super admin receives every permission.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='super_admin' and r.organization_id is null
on conflict do nothing;

-- HR permissions.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array[
'employees.view','employees.create','employees.update','employees.delete','branches.manage','departments.manage','sections.manage','job_titles.manage',
'evaluations.view','evaluations.create','evaluations.edit','evaluations.submit','evaluations.review','evaluations.approve','evaluations.publish','evaluations.reopen',
'criteria.manage','targets.view','targets.manage','attendance.view','attendance.manage','reports.view','reports.export','audit_logs.view'
]) where r.code='hr_admin' and r.organization_id is null on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array[
'employees.view','evaluations.view','evaluations.create','evaluations.edit','evaluations.submit','targets.view','targets.manage','reports.view','reports.export'
]) where r.code='branch_manager' and r.organization_id is null on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array[
'employees.view','evaluations.view','evaluations.create','evaluations.edit','evaluations.submit','reports.view','reports.export'
]) where r.code='department_manager' and r.organization_id is null on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array[
'employees.view','evaluations.view','evaluations.create','evaluations.edit','evaluations.submit'
]) where r.code='supervisor' and r.organization_id is null on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array['reports.view','reports.export','audit_logs.view'])
where r.code='auditor' and r.organization_id is null on conflict do nothing;

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path=public as $$
  select organization_id from public.profiles where id=auth.uid() and is_active=true;
$$;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path=public as $$
  select employee_id from public.profiles where id=auth.uid() and is_active=true;
$$;

create or replace function public.has_permission(p_code text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id=ur.role_id and r.active
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    join public.profiles pr on pr.id=ur.user_id and pr.is_active
    where ur.user_id=auth.uid() and ur.organization_id=public.current_org_id() and p.code=p_code
  );
$$;

create or replace function public.department_in_scope(p_department uuid, p_scope_department uuid)
returns boolean language sql stable security definer set search_path=public as $$
with recursive tree as (
  select id,parent_department_id from public.departments where id=p_department
  union all
  select d.id,d.parent_department_id from public.departments d join tree t on t.parent_department_id=d.id
)
select exists(select 1 from tree where id=p_scope_department);
$$;

create or replace function public.can_access_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select p_branch is not null and exists (
    select 1 from public.user_roles ur
    join public.role_scopes rs on rs.user_role_id=ur.id
    where ur.user_id=auth.uid() and ur.organization_id=public.current_org_id() and (
      rs.scope_type='organization' or
      (rs.scope_type='branch' and rs.scope_id=p_branch) or
      (rs.scope_type='department' and exists(select 1 from public.departments d where d.id=rs.scope_id and d.branch_id=p_branch))
    )
  ) or exists (
    select 1 from public.employees e where e.id=public.current_employee_id() and e.branch_id=p_branch
  );
$$;

create or replace function public.can_access_department(p_department uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select p_department is not null and exists (
    select 1 from public.user_roles ur
    join public.role_scopes rs on rs.user_role_id=ur.id
    where ur.user_id=auth.uid() and ur.organization_id=public.current_org_id() and (
      rs.scope_type='organization' or
      (rs.scope_type='department' and public.department_in_scope(p_department,rs.scope_id)) or
      (rs.scope_type='branch' and exists(select 1 from public.departments d where d.id=p_department and d.branch_id=rs.scope_id))
    )
  ) or exists (
    select 1 from public.employees e where e.id=public.current_employee_id() and e.department_id=p_department
  );
$$;

create or replace function public.can_access_employee(p_employee uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select p_employee=public.current_employee_id() or exists (
    select 1
    from public.employees e
    join public.user_roles ur on ur.user_id=auth.uid() and ur.organization_id=e.organization_id
    join public.role_scopes rs on rs.user_role_id=ur.id
    where e.id=p_employee and e.deleted_at is null and (
      rs.scope_type='organization' or
      (rs.scope_type='branch' and rs.scope_id=e.branch_id) or
      (rs.scope_type='department' and e.department_id is not null and public.department_in_scope(e.department_id,rs.scope_id)) or
      (rs.scope_type='assigned_employees' and (
        e.manager_id=public.current_employee_id() or e.supervisor_id=public.current_employee_id() or
        exists(select 1 from public.evaluation_assignments ea where ea.employee_id=e.id and ea.evaluator_user_id=auth.uid())
      ))
    )
  );
$$;

create or replace function public.can_insert_employee(p_branch uuid,p_department uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.has_permission('employees.create') and exists (
   select 1 from public.user_roles ur join public.role_scopes rs on rs.user_role_id=ur.id
   where ur.user_id=auth.uid() and ur.organization_id=public.current_org_id() and (
     rs.scope_type='organization' or
     (rs.scope_type='branch' and rs.scope_id=p_branch) or
     (rs.scope_type='department' and p_department is not null and public.department_in_scope(p_department,rs.scope_id))
   )
 );
$$;

create or replace function public.can_access_evaluation(p_evaluation uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
   select 1 from public.evaluations e
   where e.id=p_evaluation and (
     e.evaluator_user_id=auth.uid() or
     (e.employee_id=public.current_employee_id() and e.status in ('published','locked')) or
     (public.has_permission('evaluations.view') and public.can_access_employee(e.employee_id))
   )
 );
$$;

-- RLS enablement.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_scopes enable row level security;
alter table public.branches enable row level security;
alter table public.departments enable row level security;
alter table public.sections enable row level security;
alter table public.job_titles enable row level security;
alter table public.employees enable row level security;
alter table public.employee_assignments enable row level security;
alter table public.employee_manager_history enable row level security;
alter table public.evaluation_cycles enable row level security;
alter table public.evaluation_templates enable row level security;
alter table public.evaluation_criteria enable row level security;
alter table public.template_criteria enable row level security;
alter table public.employee_custom_criteria enable row level security;
alter table public.evaluation_exclusions enable row level security;
alter table public.evaluation_assignments enable row level security;
alter table public.evaluations enable row level security;
alter table public.evaluation_answers enable row level security;
alter table public.evaluation_versions enable row level security;
alter table public.sales_targets enable row level security;
alter table public.branch_targets enable row level security;
alter table public.attendance_penalty_types enable row level security;
alter table public.attendance_evaluations enable row level security;
alter table public.attendance_penalty_entries enable row level security;
alter table public.notifications enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
alter table public.login_attempts enable row level security;

-- Organizations.
create policy org_select on public.organizations for select to authenticated using (id=public.current_org_id());
create policy org_update on public.organizations for update to authenticated using (id=public.current_org_id() and public.has_permission('settings.manage')) with check (id=public.current_org_id());

-- Profiles and RBAC metadata.
create policy profiles_select on public.profiles for select to authenticated using (id=auth.uid() or (organization_id=public.current_org_id() and public.has_permission('users.view')));
create policy profiles_self_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and organization_id=public.current_org_id());
create policy profiles_admin_update on public.profiles for update to authenticated using (organization_id=public.current_org_id() and public.has_permission('users.update')) with check (organization_id=public.current_org_id());
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy roles_select on public.roles for select to authenticated using (organization_id is null or organization_id=public.current_org_id());
create policy roles_manage_insert on public.roles for insert to authenticated with check (organization_id=public.current_org_id() and public.has_permission('roles.manage'));
create policy roles_manage_update on public.roles for update to authenticated using (organization_id=public.current_org_id() and not is_system and public.has_permission('roles.manage')) with check (organization_id=public.current_org_id());
create policy role_permissions_select on public.role_permissions for select to authenticated using (exists(select 1 from public.roles r where r.id=role_id and (r.organization_id is null or r.organization_id=public.current_org_id())));
create policy role_permissions_manage on public.role_permissions for all to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
create policy user_roles_select on public.user_roles for select to authenticated using (user_id=auth.uid() or (organization_id=public.current_org_id() and public.has_permission('users.view')));
create policy user_roles_manage on public.user_roles for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('roles.manage')) with check (organization_id=public.current_org_id() and public.has_permission('roles.manage'));
create policy role_scopes_select on public.role_scopes for select to authenticated using (exists(select 1 from public.user_roles ur where ur.id=user_role_id and (ur.user_id=auth.uid() or (ur.organization_id=public.current_org_id() and public.has_permission('users.view')))));
create policy role_scopes_manage on public.role_scopes for all to authenticated using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));

-- Organization structure.
create policy branches_select on public.branches for select to authenticated using (organization_id=public.current_org_id() and deleted_at is null and (public.can_access_branch(id) or public.has_permission('branches.manage')));
create policy branches_insert on public.branches for insert to authenticated with check (organization_id=public.current_org_id() and public.has_permission('branches.manage'));
create policy branches_update on public.branches for update to authenticated using (organization_id=public.current_org_id() and public.has_permission('branches.manage')) with check (organization_id=public.current_org_id());
create policy departments_select on public.departments for select to authenticated using (organization_id=public.current_org_id() and deleted_at is null and (public.can_access_department(id) or public.has_permission('departments.manage')));
create policy departments_insert on public.departments for insert to authenticated with check (organization_id=public.current_org_id() and public.has_permission('departments.manage'));
create policy departments_update on public.departments for update to authenticated using (organization_id=public.current_org_id() and public.has_permission('departments.manage')) with check (organization_id=public.current_org_id());
create policy sections_select on public.sections for select to authenticated using (organization_id=public.current_org_id() and deleted_at is null and (public.can_access_department(department_id) or public.has_permission('sections.manage')));
create policy sections_manage on public.sections for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('sections.manage')) with check (organization_id=public.current_org_id());
create policy job_titles_select on public.job_titles for select to authenticated using (organization_id=public.current_org_id() and deleted_at is null);
create policy job_titles_manage on public.job_titles for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('job_titles.manage')) with check (organization_id=public.current_org_id());

-- Employees.
create policy employees_select on public.employees for select to authenticated using (organization_id=public.current_org_id() and deleted_at is null and (id=public.current_employee_id() or (public.has_permission('employees.view') and public.can_access_employee(id))));
create policy employees_insert on public.employees for insert to authenticated with check (organization_id=public.current_org_id() and public.can_insert_employee(branch_id,department_id));
create policy employees_update on public.employees for update to authenticated using (organization_id=public.current_org_id() and public.has_permission('employees.update') and public.can_access_employee(id)) with check (organization_id=public.current_org_id());
create policy employees_delete on public.employees for delete to authenticated using (organization_id=public.current_org_id() and public.has_permission('employees.delete') and public.can_access_employee(id));
create policy employee_assignments_select on public.employee_assignments for select to authenticated using (public.can_access_employee(employee_id));
create policy employee_assignments_manage on public.employee_assignments for all to authenticated using (public.has_permission('employees.update') and public.can_access_employee(employee_id)) with check (public.has_permission('employees.update') and public.can_access_employee(employee_id));
create policy employee_manager_history_select on public.employee_manager_history for select to authenticated using (public.can_access_employee(employee_id));

-- Evaluation metadata.
create policy cycles_select on public.evaluation_cycles for select to authenticated using (organization_id=public.current_org_id());
create policy cycles_manage on public.evaluation_cycles for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('evaluations.create')) with check (organization_id=public.current_org_id());
create policy templates_select on public.evaluation_templates for select to authenticated using (organization_id=public.current_org_id());
create policy templates_manage on public.evaluation_templates for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('criteria.manage')) with check (organization_id=public.current_org_id());
create policy criteria_select on public.evaluation_criteria for select to authenticated using (organization_id=public.current_org_id());
create policy criteria_manage on public.evaluation_criteria for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('criteria.manage')) with check (organization_id=public.current_org_id());
create policy template_criteria_select on public.template_criteria for select to authenticated using (exists(select 1 from public.evaluation_templates t where t.id=template_id and t.organization_id=public.current_org_id()));
create policy template_criteria_manage on public.template_criteria for all to authenticated using (public.has_permission('criteria.manage')) with check (public.has_permission('criteria.manage'));
create policy custom_criteria_select on public.employee_custom_criteria for select to authenticated using (public.can_access_employee(employee_id));
create policy custom_criteria_manage on public.employee_custom_criteria for all to authenticated using (public.has_permission('criteria.manage') and public.can_access_employee(employee_id)) with check (public.has_permission('criteria.manage') and public.can_access_employee(employee_id));
create policy exclusions_select on public.evaluation_exclusions for select to authenticated using (public.can_access_employee(employee_id) or public.has_permission('evaluations.view'));
create policy exclusions_manage on public.evaluation_exclusions for all to authenticated using (public.has_permission('evaluations.edit') and public.can_access_employee(employee_id)) with check (public.has_permission('evaluations.edit') and public.can_access_employee(employee_id));

-- Evaluation runtime.
create policy eval_assign_select on public.evaluation_assignments for select to authenticated using (evaluator_user_id=auth.uid() or employee_id=public.current_employee_id() or (public.has_permission('evaluations.view') and public.can_access_employee(employee_id)));
create policy eval_assign_manage on public.evaluation_assignments for all to authenticated using (public.has_permission('evaluations.create') and public.can_access_employee(employee_id)) with check (public.has_permission('evaluations.create') and public.can_access_employee(employee_id));
create policy evaluations_select on public.evaluations for select to authenticated using (
  evaluator_user_id=auth.uid() or
  (employee_id=public.current_employee_id() and status in ('published','locked')) or
  (public.has_permission('evaluations.view') and public.can_access_employee(employee_id))
);
create policy evaluations_insert on public.evaluations for insert to authenticated with check ((evaluator_user_id=auth.uid() and public.has_permission('evaluations.create')) or public.has_permission('evaluations.edit'));
create policy evaluations_update on public.evaluations for update to authenticated using ((evaluator_user_id=auth.uid() and public.has_permission('evaluations.edit') and status in ('draft','submitted')) or (public.has_permission('evaluations.edit') and public.can_access_employee(employee_id))) with check (public.can_access_employee(employee_id));
create policy answers_select on public.evaluation_answers for select to authenticated using (exists(select 1 from public.evaluations e where e.id=evaluation_id and (
 e.evaluator_user_id=auth.uid() or
 (e.employee_id=public.current_employee_id() and e.status in ('published','locked') and exists(select 1 from public.evaluation_criteria c where c.id=criterion_id and c.visible_to_employee)) or
 (public.has_permission('evaluations.view') and public.can_access_employee(e.employee_id))
)));
create policy answers_manage on public.evaluation_answers for all to authenticated using (exists(select 1 from public.evaluations e where e.id=evaluation_id and e.status='draft' and ((e.evaluator_user_id=auth.uid() and public.has_permission('evaluations.edit')) or public.has_permission('evaluations.edit')))) with check (exists(select 1 from public.evaluations e where e.id=evaluation_id and e.status='draft' and public.can_access_employee(e.employee_id)));
create policy versions_select on public.evaluation_versions for select to authenticated using (exists(select 1 from public.evaluations e where e.id=evaluation_id and public.can_access_evaluation(e.id)));

-- Targets.
create policy sales_targets_select on public.sales_targets for select to authenticated using (organization_id=public.current_org_id() and (employee_id=public.current_employee_id() or (public.has_permission('targets.view') and public.can_access_employee(employee_id))));
create policy sales_targets_manage on public.sales_targets for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('targets.manage') and public.can_access_employee(employee_id)) with check (organization_id=public.current_org_id() and public.has_permission('targets.manage') and public.can_access_employee(employee_id));
create policy branch_targets_select on public.branch_targets for select to authenticated using (organization_id=public.current_org_id() and (public.can_access_branch(branch_id) or public.has_permission('targets.view')));
create policy branch_targets_manage on public.branch_targets for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('targets.manage') and public.can_access_branch(branch_id)) with check (organization_id=public.current_org_id() and public.has_permission('targets.manage') and public.can_access_branch(branch_id));

-- Attendance.
create policy penalty_types_select on public.attendance_penalty_types for select to authenticated using (organization_id=public.current_org_id() and active);
create policy penalty_types_manage on public.attendance_penalty_types for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('attendance.manage')) with check (organization_id=public.current_org_id() and public.has_permission('attendance.manage'));
create policy attendance_select on public.attendance_evaluations for select to authenticated using (employee_id=public.current_employee_id() or (public.has_permission('attendance.view') and public.can_access_employee(employee_id)));
create policy attendance_manage on public.attendance_evaluations for all to authenticated using (public.has_permission('attendance.manage') and public.can_access_employee(employee_id)) with check (public.has_permission('attendance.manage') and public.can_access_employee(employee_id));
create policy attendance_entries_select on public.attendance_penalty_entries for select to authenticated using (exists(select 1 from public.attendance_evaluations ae where ae.id=attendance_evaluation_id and (ae.employee_id=public.current_employee_id() or (public.has_permission('attendance.view') and public.can_access_employee(ae.employee_id)))));
create policy attendance_entries_manage on public.attendance_penalty_entries for all to authenticated using (exists(select 1 from public.attendance_evaluations ae where ae.id=attendance_evaluation_id and public.has_permission('attendance.manage') and public.can_access_employee(ae.employee_id))) with check (exists(select 1 from public.attendance_evaluations ae where ae.id=attendance_evaluation_id and public.has_permission('attendance.manage') and public.can_access_employee(ae.employee_id)));

-- Notifications, files, audit, settings.
create policy notifications_own on public.notifications for select to authenticated using (user_id=auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy attachments_select on public.attachments for select to authenticated using (organization_id=public.current_org_id() and (uploaded_by=auth.uid() or public.has_permission('employees.view') or public.has_permission('evaluations.view')));
create policy attachments_insert on public.attachments for insert to authenticated with check (organization_id=public.current_org_id() and uploaded_by=auth.uid());
create policy attachments_delete on public.attachments for delete to authenticated using (organization_id=public.current_org_id() and (uploaded_by=auth.uid() or public.has_permission('employees.update')));
create policy audit_select on public.audit_logs for select to authenticated using (organization_id=public.current_org_id() and public.has_permission('audit_logs.view'));
create policy settings_select on public.system_settings for select to authenticated using (organization_id=public.current_org_id() and public.has_permission('settings.manage'));
create policy settings_manage on public.system_settings for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('settings.manage')) with check (organization_id=public.current_org_id() and public.has_permission('settings.manage'));
-- login_attempts intentionally has no anon/authenticated RLS policies; only service-role server code can read/write it.

-- Protect audit logs from changes through ordinary roles.
revoke update, delete on public.audit_logs from authenticated;
revoke all on public.login_attempts from anon, authenticated;

-- ===== END supabase/migrations/0002_security_rbac_rls.sql =====

-- ===== BEGIN supabase/migrations/0003_business_logic.sql =====
-- 0003_business_logic.sql
-- Configurable scales, transactional business functions and audit trail.

create table public.rating_scale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  value numeric(6,2) not null check (value > 0),
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,value)
);

create table public.performance_bands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dimension text not null check (dimension in ('performance','attendance','target')),
  min_value numeric(10,3) not null,
  label text not null,
  tone text not null default 'neutral',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,dimension,min_value)
);

create trigger set_rating_scale_updated_at before update on public.rating_scale_items for each row execute function public.set_updated_at();
create trigger set_performance_bands_updated_at before update on public.performance_bands for each row execute function public.set_updated_at();

alter table public.rating_scale_items enable row level security;
alter table public.performance_bands enable row level security;
create policy rating_scale_select on public.rating_scale_items for select to authenticated using (organization_id=public.current_org_id() and active);
create policy rating_scale_manage on public.rating_scale_items for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('settings.manage')) with check (organization_id=public.current_org_id() and public.has_permission('settings.manage'));
create policy bands_select on public.performance_bands for select to authenticated using (organization_id=public.current_org_id());
create policy bands_manage on public.performance_bands for all to authenticated using (organization_id=public.current_org_id() and public.has_permission('settings.manage')) with check (organization_id=public.current_org_id() and public.has_permission('settings.manage'));

create or replace function public.audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old jsonb default null,
  p_new jsonb default null,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values,reason)
  values(public.current_org_id(),auth.uid(),p_action,p_entity_type,p_entity_id,p_old,p_new,p_reason)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.result_label(p_org uuid,p_dimension text,p_score numeric)
returns text language sql stable security definer set search_path=public as $$
  select coalesce(
    (select label from public.performance_bands
      where organization_id=p_org and dimension=p_dimension and min_value<=p_score
      order by min_value desc limit 1),
    case when p_dimension='performance' then
      case when p_score>=4.5 then 'ممتاز' when p_score>=3.5 then 'جيد جداً' when p_score>=2.5 then 'جيد' when p_score>=1.5 then 'مقبول' else 'ضعيف' end
    when p_dimension='attendance' then
      case when p_score>=95 then 'ممتاز' when p_score>=85 then 'جيد جداً' when p_score>=70 then 'جيد' when p_score>=60 then 'مقبول' else 'ضعيف' end
    when p_dimension='target' then
      case when p_score>=100 then 'حقق الهدف' else 'أقل من الهدف' end
    else null end
  );
$$;

create or replace function public.resolve_evaluation_template(p_employee uuid)
returns uuid language sql stable security definer set search_path=public as $$
select t.id
from public.employees e
join public.evaluation_templates t on t.organization_id=e.organization_id and t.active
where e.id=p_employee and (
  (t.scope_type='employee' and t.scope_id=e.id) or
  (t.scope_type='department' and t.scope_id=e.department_id) or
  (t.scope_type='job_title' and t.scope_id=e.job_title_id) or
  (t.scope_type='general' and t.scope_id is null)
)
order by case t.scope_type when 'employee' then 1 when 'department' then 2 when 'job_title' then 3 else 4 end, t.version desc
limit 1;
$$;

create or replace function public.open_evaluation_cycle(p_cycle uuid)
returns integer
language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_count integer;
begin
  if not public.has_permission('evaluations.create') then raise exception 'permission_denied'; end if;
  select organization_id into v_org from public.evaluation_cycles where id=p_cycle for update;
  if v_org is null or v_org<>public.current_org_id() then raise exception 'cycle_not_found'; end if;

  update public.evaluation_cycles set status='open',opened_at=coalesce(opened_at,now()) where id=p_cycle;

  with candidates as (
    select e.id employee_id,
           coalesce(pm.id,ps.id) evaluator_user_id,
           public.resolve_evaluation_template(e.id) template_id
    from public.employees e
    left join public.profiles pm on pm.employee_id=e.manager_id and pm.is_active
    left join public.profiles ps on ps.employee_id=e.supervisor_id and ps.is_active
    where e.organization_id=v_org and e.status='active' and e.deleted_at is null
      and not exists(select 1 from public.evaluation_exclusions x where x.cycle_id=p_cycle and x.employee_id=e.id)
  ), ins as (
    insert into public.evaluation_assignments(cycle_id,employee_id,evaluator_user_id,template_id,evaluation_type,due_at,created_by)
    select p_cycle,c.employee_id,c.evaluator_user_id,c.template_id,'performance',
           (select ends_at::timestamptz + interval '23 hours 59 minutes' from public.evaluation_cycles where id=p_cycle),auth.uid()
    from candidates c where c.evaluator_user_id is not null and c.template_id is not null
    on conflict (cycle_id,employee_id,evaluator_user_id,evaluation_type) do nothing
    returning evaluator_user_id
  )
  select count(*) into v_count from ins;

  insert into public.notifications(organization_id,user_id,title,body,kind,entity_type,entity_id)
  select v_org,evaluator_user_id,'تم فتح دورة تقييم','لديك '||count(*)||' موظف/موظفين بحاجة للتقييم.','evaluation_cycle','evaluation_cycle',p_cycle
  from public.evaluation_assignments where cycle_id=p_cycle group by evaluator_user_id
  on conflict do nothing;

  perform public.audit_event('evaluation_cycle.open','evaluation_cycle',p_cycle,null,jsonb_build_object('status','open','assignments_created',v_count),null);
  return v_count;
end;
$$;

create or replace function public.ensure_evaluation(p_assignment uuid)
returns uuid
language plpgsql security definer set search_path=public as $$
declare a public.evaluation_assignments%rowtype; v_id uuid; v_snapshot jsonb;
begin
  select * into a from public.evaluation_assignments where id=p_assignment;
  if a.id is null then raise exception 'assignment_not_found'; end if;
  if a.evaluator_user_id<>auth.uid() and not (public.has_permission('evaluations.edit') and public.can_access_employee(a.employee_id)) then raise exception 'permission_denied'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'criterion_id',c.id,'name',c.name,'description',c.description,'weight',tc.weight,
    'max_score',c.max_score,'mandatory',tc.mandatory,'visible_to_employee',tc.visible_to_employee,
    'comment_required',tc.comment_required,'sort_order',tc.sort_order
  ) order by tc.sort_order),'[]'::jsonb)
  into v_snapshot
  from public.template_criteria tc join public.evaluation_criteria c on c.id=tc.criterion_id
  where tc.template_id=a.template_id and c.active;

  insert into public.evaluations(assignment_id,cycle_id,employee_id,evaluator_user_id,evaluation_type,template_id,template_snapshot)
  values(a.id,a.cycle_id,a.employee_id,a.evaluator_user_id,a.evaluation_type,a.template_id,v_snapshot)
  on conflict (assignment_id) do update set updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.recalculate_evaluation(p_evaluation uuid)
returns numeric
language plpgsql security definer set search_path=public as $$
declare v_template uuid; v_org uuid; v_expected integer; v_answered integer; v_score numeric;
begin
  select e.template_id,emp.organization_id into v_template,v_org
  from public.evaluations e join public.employees emp on emp.id=e.employee_id where e.id=p_evaluation;
  if v_template is null then return null; end if;

  select count(*) into v_expected from public.template_criteria where template_id=v_template and mandatory;
  select count(*) into v_answered
  from public.evaluation_answers a join public.template_criteria tc on tc.template_id=v_template and tc.criterion_id=a.criterion_id
  where a.evaluation_id=p_evaluation and tc.mandatory;
  if v_answered<v_expected then
    update public.evaluations set weighted_score=null,final_score=null,result_label=null where id=p_evaluation;
    return null;
  end if;

  select round(sum(a.score*a.weight_snapshot)/nullif(sum(a.weight_snapshot),0),3)
    into v_score from public.evaluation_answers a where a.evaluation_id=p_evaluation;
  update public.evaluations set weighted_score=v_score,final_score=v_score,result_label=public.result_label(v_org,'performance',v_score) where id=p_evaluation;
  return v_score;
end;
$$;

create or replace function public.save_evaluation_draft(p_evaluation uuid,p_notes text,p_answers jsonb)
returns numeric
language plpgsql security definer set search_path=public as $$
declare e public.evaluations%rowtype; item jsonb; c_id uuid; c_score numeric; tc record; v_score numeric;
begin
  select * into e from public.evaluations where id=p_evaluation for update;
  if e.id is null then raise exception 'evaluation_not_found'; end if;
  if e.status<>'draft' then raise exception 'evaluation_not_editable'; end if;
  if e.evaluator_user_id<>auth.uid() and not (public.has_permission('evaluations.edit') and public.can_access_employee(e.employee_id)) then raise exception 'permission_denied'; end if;

  for item in select * from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) loop
    c_id=(item->>'criterion_id')::uuid;
    c_score=(item->>'score')::numeric;
    select c.id,c.name,c.description,c.max_score,tc.weight into tc
      from public.template_criteria tc join public.evaluation_criteria c on c.id=tc.criterion_id
      where tc.template_id=e.template_id and c.id=c_id;
    if tc.id is null then raise exception 'criterion_not_in_template'; end if;
    if c_score<=0 or c_score>tc.max_score then raise exception 'invalid_score'; end if;
    insert into public.evaluation_answers(evaluation_id,criterion_id,criterion_name_snapshot,criterion_description_snapshot,weight_snapshot,max_score_snapshot,score,comment)
    values(e.id,c_id,tc.name,tc.description,tc.weight,tc.max_score,c_score,nullif(item->>'comment',''))
    on conflict (evaluation_id,criterion_id) do update set score=excluded.score,comment=excluded.comment,updated_at=now();
  end loop;
  update public.evaluations set notes=p_notes where id=e.id;
  v_score=public.recalculate_evaluation(e.id);
  return v_score;
end;
$$;

create or replace function public.transition_evaluation(p_evaluation uuid,p_to public.evaluation_status,p_reason text default null)
returns public.evaluation_status
language plpgsql security definer set search_path=public as $$
declare e public.evaluations%rowtype; v_snapshot jsonb;
begin
  select * into e from public.evaluations where id=p_evaluation for update;
  if e.id is null then raise exception 'evaluation_not_found'; end if;

  if p_to='submitted' then
    if e.status<>'draft' or e.evaluator_user_id<>auth.uid() or not public.has_permission('evaluations.submit') then raise exception 'invalid_transition'; end if;
    if public.recalculate_evaluation(e.id) is null then raise exception 'evaluation_incomplete'; end if;
    update public.evaluations set status='submitted',submitted_at=now() where id=e.id;
  elsif p_to='reviewed' then
    if e.status<>'submitted' or not public.has_permission('evaluations.review') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='reviewed',reviewed_at=now(),reviewed_by=auth.uid() where id=e.id;
  elsif p_to='approved' then
    if e.status not in ('submitted','reviewed') or not public.has_permission('evaluations.approve') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='approved',approved_at=now(),approved_by=auth.uid() where id=e.id;
  elsif p_to='published' then
    if e.status<>'approved' or not public.has_permission('evaluations.publish') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='published',published_at=now(),published_by=auth.uid() where id=e.id;
    insert into public.notifications(organization_id,user_id,title,body,kind,entity_type,entity_id)
    select emp.organization_id,p.id,'تم نشر تقييمك','أصبح تقييمك متاحًا في بوابة الموظف.','evaluation_published','evaluation',e.id
    from public.employees emp join public.profiles p on p.employee_id=emp.id where emp.id=e.employee_id;
  elsif p_to='locked' then
    if e.status<>'published' or not public.has_permission('evaluations.approve') then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='locked',locked_at=now() where id=e.id;
  elsif p_to='draft' then
    if e.status not in ('submitted','reviewed','approved','published','locked') or not public.has_permission('evaluations.reopen') then raise exception 'invalid_transition'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'reopen_reason_required'; end if;
    select jsonb_build_object('evaluation',to_jsonb(e),'answers',coalesce((select jsonb_agg(to_jsonb(a)) from public.evaluation_answers a where a.evaluation_id=e.id),'[]'::jsonb)) into v_snapshot;
    insert into public.evaluation_versions(evaluation_id,version,snapshot,reason,created_by) values(e.id,e.version,v_snapshot,p_reason,auth.uid()) on conflict do nothing;
    update public.evaluations set status='draft',version=version+1,reopened_at=now(),reopened_by=auth.uid(),reopen_reason=p_reason,
      submitted_at=null,reviewed_at=null,reviewed_by=null,approved_at=null,approved_by=null,published_at=null,published_by=null,locked_at=null where id=e.id;
  else
    raise exception 'unsupported_transition';
  end if;

  perform public.audit_event('evaluation.transition','evaluation',e.id,jsonb_build_object('status',e.status),jsonb_build_object('status',p_to),p_reason);
  return p_to;
end;
$$;

create or replace function public.upsert_sales_target(
  p_cycle uuid,p_employee uuid,p_target numeric,p_achieved numeric,p_reason text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare oldrow public.sales_targets%rowtype; emp public.employees%rowtype; v_id uuid;
begin
  if not public.has_permission('targets.manage') or not public.can_access_employee(p_employee) then raise exception 'permission_denied'; end if;
  if p_target<=0 or p_achieved<0 then raise exception 'invalid_amount'; end if;
  select * into emp from public.employees where id=p_employee and organization_id=public.current_org_id();
  if emp.id is null then raise exception 'employee_not_found'; end if;
  select * into oldrow from public.sales_targets where cycle_id=p_cycle and employee_id=p_employee for update;
  if oldrow.id is not null and oldrow.target_amount<>p_target and nullif(trim(p_reason),'') is null then raise exception 'target_change_reason_required'; end if;
  insert into public.sales_targets(organization_id,cycle_id,employee_id,branch_id,department_id,target_amount,achieved_amount,last_edit_reason,created_by)
  values(emp.organization_id,p_cycle,p_employee,emp.branch_id,emp.department_id,p_target,p_achieved,p_reason,auth.uid())
  on conflict (cycle_id,employee_id) do update set target_amount=excluded.target_amount,achieved_amount=excluded.achieved_amount,last_edit_reason=excluded.last_edit_reason,updated_at=now()
  returning id into v_id;
  perform public.audit_event('sales_target.upsert','sales_target',v_id,case when oldrow.id is null then null else to_jsonb(oldrow) end,
    (select to_jsonb(s) from public.sales_targets s where s.id=v_id),p_reason);
  return v_id;
end;
$$;

create or replace function public.save_attendance_evaluation(
  p_cycle uuid,p_employee uuid,p_notes text,p_entries jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; item jsonb; pt public.attendance_penalty_types%rowtype; total numeric:=0; occ integer;
begin
  if not public.has_permission('attendance.manage') or not public.can_access_employee(p_employee) then raise exception 'permission_denied'; end if;
  insert into public.attendance_evaluations(cycle_id,employee_id,base_score,final_score,notes,evaluator_user_id)
  values(p_cycle,p_employee,100,100,p_notes,auth.uid())
  on conflict (cycle_id,employee_id) do update set notes=excluded.notes,evaluator_user_id=auth.uid(),updated_at=now()
  returning id into v_id;
  delete from public.attendance_penalty_entries where attendance_evaluation_id=v_id;
  for item in select * from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) loop
    select * into pt from public.attendance_penalty_types where id=(item->>'penalty_type_id')::uuid and organization_id=public.current_org_id() and active;
    if pt.id is null then raise exception 'invalid_penalty_type'; end if;
    occ=greatest(0,coalesce((item->>'occurrences')::integer,0));
    total=total+(occ*pt.deduction_points);
    insert into public.attendance_penalty_entries(attendance_evaluation_id,penalty_type_id,occurrences,deduction_points_snapshot,note)
    values(v_id,pt.id,occ,pt.deduction_points,nullif(item->>'note',''));
  end loop;
  update public.attendance_evaluations set final_score=greatest(0,100-total) where id=v_id;
  perform public.audit_event('attendance.save','attendance_evaluation',v_id,null,jsonb_build_object('final_score',greatest(0,100-total)),null);
  return v_id;
end;
$$;

create or replace function public.transfer_employee(
  p_employee uuid,p_branch uuid,p_department uuid,p_section uuid,p_job_title uuid,p_manager uuid,p_supervisor uuid,p_reason text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare olde public.employees%rowtype; v_assignment uuid;
begin
  if not public.has_permission('employees.update') or not public.can_access_employee(p_employee) then raise exception 'permission_denied'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into olde from public.employees where id=p_employee for update;
  if olde.id is null then raise exception 'employee_not_found'; end if;

  update public.employee_assignments set is_current=false,effective_to=current_date where employee_id=p_employee and is_current;
  insert into public.employee_assignments(employee_id,branch_id,department_id,section_id,job_title_id,manager_id,supervisor_id,effective_from,reason,is_current,created_by)
  values(p_employee,p_branch,p_department,p_section,p_job_title,p_manager,p_supervisor,current_date,p_reason,true,auth.uid()) returning id into v_assignment;

  if olde.manager_id is distinct from p_manager then
    insert into public.employee_manager_history(employee_id,old_manager_id,new_manager_id,reason,changed_by) values(p_employee,olde.manager_id,p_manager,p_reason,auth.uid());
  end if;
  update public.employees set branch_id=p_branch,department_id=p_department,section_id=p_section,job_title_id=p_job_title,manager_id=p_manager,supervisor_id=p_supervisor where id=p_employee;
  perform public.audit_event('employee.transfer','employee',p_employee,to_jsonb(olde),(select to_jsonb(e) from public.employees e where e.id=p_employee),p_reason);
  return v_assignment;
end;
$$;

create or replace function public.disable_branch(p_branch uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare c integer;
begin
  if not public.has_permission('branches.manage') then raise exception 'permission_denied'; end if;
  select count(*) into c from public.employees where branch_id=p_branch and deleted_at is null and status='active';
  if c>0 then
    update public.branches set active=false where id=p_branch and organization_id=public.current_org_id();
  else
    update public.branches set active=false,deleted_at=coalesce(deleted_at,now()) where id=p_branch and organization_id=public.current_org_id();
  end if;
  perform public.audit_event('branch.disable','branch',p_branch,null,jsonb_build_object('active',false,'active_employees',c),p_reason);
end;
$$;

-- Generic database audit for direct API changes not using the transactional RPCs.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_id uuid; v_action text;
begin
  v_action=lower(tg_op);
  if tg_op='DELETE' then
    v_id=old.id; v_org=coalesce((to_jsonb(old)->>'organization_id')::uuid,public.current_org_id());
    insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values)
    values(v_org,auth.uid(),tg_table_name||'.'||v_action,tg_table_name,v_id,to_jsonb(old),null);
    return old;
  else
    v_id=new.id; v_org=coalesce((to_jsonb(new)->>'organization_id')::uuid,public.current_org_id());
    insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,old_values,new_values)
    values(v_org,auth.uid(),tg_table_name||'.'||v_action,tg_table_name,v_id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
    return new;
  end if;
end;
$$;

create trigger audit_employees after insert or update or delete on public.employees for each row execute function public.audit_row_change();
create trigger audit_branches after insert or update or delete on public.branches for each row execute function public.audit_row_change();
create trigger audit_departments after insert or update or delete on public.departments for each row execute function public.audit_row_change();
create trigger audit_job_titles after insert or update or delete on public.job_titles for each row execute function public.audit_row_change();
create trigger audit_templates after insert or update or delete on public.evaluation_templates for each row execute function public.audit_row_change();
create trigger audit_criteria after insert or update or delete on public.evaluation_criteria for each row execute function public.audit_row_change();
create trigger audit_sales_targets after insert or update or delete on public.sales_targets for each row execute function public.audit_row_change();

-- Reporting views. RLS on base tables remains in effect for invoker queries.
create or replace view public.employee_performance_report with (security_invoker=true) as
select e.id employee_id,e.employee_number,e.full_name,b.name branch,d.name department,j.name job_title,
       c.year,c.month,ev.final_score,ev.result_label,ev.status,ev.published_at
from public.employees e
left join public.branches b on b.id=e.branch_id
left join public.departments d on d.id=e.department_id
left join public.job_titles j on j.id=e.job_title_id
left join public.evaluations ev on ev.employee_id=e.id
left join public.evaluation_cycles c on c.id=ev.cycle_id;

create or replace view public.sales_target_report with (security_invoker=true) as
select s.id,s.employee_id,e.full_name,b.name branch,d.name department,c.year,c.month,s.target_amount,s.achieved_amount,
       round((s.achieved_amount/nullif(s.target_amount,0))*100,1) achievement_percentage,
       public.result_label(s.organization_id,'target',(s.achieved_amount/nullif(s.target_amount,0))*100) achievement_label
from public.sales_targets s
join public.employees e on e.id=s.employee_id
left join public.branches b on b.id=s.branch_id
left join public.departments d on d.id=s.department_id
join public.evaluation_cycles c on c.id=s.cycle_id;

create or replace view public.attendance_report with (security_invoker=true) as
select a.id,a.employee_id,e.full_name,c.year,c.month,a.final_score,
       public.result_label(e.organization_id,'attendance',a.final_score) result_label,a.status
from public.attendance_evaluations a join public.employees e on e.id=a.employee_id join public.evaluation_cycles c on c.id=a.cycle_id;

-- ===== END supabase/migrations/0003_business_logic.sql =====

-- ===== BEGIN supabase/migrations/0005_import_and_dashboard.sql =====
-- 0005_import_and_dashboard.sql
-- Server-side dashboard metrics and bulk employee import helper.

create or replace function public.dashboard_metrics(p_cycle uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_org uuid:=public.current_org_id(); v_cycle uuid:=p_cycle; out jsonb;
begin
  if v_cycle is null then select id into v_cycle from public.evaluation_cycles where organization_id=v_org order by year desc,month desc limit 1; end if;
  select jsonb_build_object(
    'employees',(select count(*) from public.employees e where e.organization_id=v_org and e.deleted_at is null and e.status='active' and (e.id=public.current_employee_id() or public.can_access_employee(e.id))),
    'branches',(select count(*) from public.branches b where b.organization_id=v_org and b.deleted_at is null and (public.can_access_branch(b.id) or public.has_permission('branches.manage'))),
    'departments',(select count(*) from public.departments d where d.organization_id=v_org and d.deleted_at is null and (public.can_access_department(d.id) or public.has_permission('departments.manage'))),
    'cycle_id',v_cycle,
    'evaluations_total',(select count(*) from public.evaluation_assignments a where a.cycle_id=v_cycle and (a.evaluator_user_id=auth.uid() or public.can_access_employee(a.employee_id))),
    'evaluations_completed',(select count(*) from public.evaluations e where e.cycle_id=v_cycle and e.status in ('submitted','reviewed','approved','published','locked') and (e.evaluator_user_id=auth.uid() or public.can_access_employee(e.employee_id))),
    'average_score',(select round(avg(e.final_score),2) from public.evaluations e where e.cycle_id=v_cycle and e.final_score is not null and public.can_access_employee(e.employee_id)),
    'target_achievement',(select round(sum(s.achieved_amount)/nullif(sum(s.target_amount),0)*100,1) from public.sales_targets s where s.cycle_id=v_cycle and public.can_access_employee(s.employee_id)),
    'pending_review',(select count(*) from public.evaluations e where e.cycle_id=v_cycle and e.status='submitted' and public.can_access_employee(e.employee_id))
  ) into out;
  return out;
end;
$$;

grant execute on function public.dashboard_metrics(uuid) to authenticated;

-- ===== END supabase/migrations/0005_import_and_dashboard.sql =====

-- ===== BEGIN supabase/migrations/0006_hardening.sql =====
-- Idempotency and operational hardening.
drop index if exists public.evaluation_templates_scope_unique;
create unique index evaluation_templates_scope_unique
  on public.evaluation_templates(
    organization_id,
    scope_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    version
  ) where active;

create unique index if not exists role_scopes_org_null_unique
  on public.role_scopes(user_role_id, scope_type, coalesce(scope_id,'00000000-0000-0000-0000-000000000000'::uuid));

-- Avoid duplicate notification delivery for the same workflow event.
create index if not exists notifications_entity_idx
  on public.notifications(user_id, entity_type, entity_id, created_at desc);

-- Search and report helpers.
create index if not exists employees_number_idx on public.employees(organization_id, employee_number);
create index if not exists audit_logs_user_idx on public.audit_logs(user_id, created_at desc);

-- View for evaluation progress, respecting RLS through security_invoker.
create or replace view public.evaluation_progress_report
with (security_invoker = true)
as
select
  c.id cycle_id, c.name cycle_name, c.year, c.month,
  count(a.id) total_assigned,
  count(e.id) filter (where e.status in ('submitted','reviewed','approved','published','locked')) completed,
  count(a.id) - count(e.id) filter (where e.status in ('submitted','reviewed','approved','published','locked')) remaining,
  round(coalesce(avg(e.final_score) filter (where e.final_score is not null),0)::numeric,2) average_score
from public.evaluation_cycles c
left join public.evaluation_assignments a on a.cycle_id=c.id
left join public.evaluations e on e.assignment_id=a.id
group by c.id,c.name,c.year,c.month;

-- Employees only see their own attendance result once it is published/locked.
drop policy if exists attendance_select on public.attendance_evaluations;
create policy attendance_select on public.attendance_evaluations for select to authenticated using (
  (employee_id=public.current_employee_id() and status in ('published','locked')) or
  (public.has_permission('attendance.view') and public.can_access_employee(employee_id))
);

-- ===== END supabase/migrations/0006_hardening.sql =====

-- ===== BEGIN supabase/migrations/0007_management_views.sql =====
create or replace view public.evaluation_management_report
with (security_invoker=true)
as
select
  a.id assignment_id,a.cycle_id,a.employee_id,a.evaluator_user_id,a.evaluation_type,a.assigned_at,a.due_at,
  emp.employee_number,emp.full_name,emp.branch_id,emp.department_id,emp.job_title_id,
  b.name branch,d.name department,j.name job_title,
  c.name cycle_name,c.year,c.month,
  p.full_name evaluator_name,
  ev.id evaluation_id,coalesce(ev.status,'draft'::public.evaluation_status) evaluation_status,ev.final_score,ev.result_label,ev.submitted_at,ev.approved_at,ev.published_at
from public.evaluation_assignments a
join public.employees emp on emp.id=a.employee_id
join public.evaluation_cycles c on c.id=a.cycle_id
left join public.branches b on b.id=emp.branch_id
left join public.departments d on d.id=emp.department_id
left join public.job_titles j on j.id=emp.job_title_id
left join public.profiles p on p.id=a.evaluator_user_id
left join public.evaluations ev on ev.assignment_id=a.id;

-- ===== END supabase/migrations/0007_management_views.sql =====

-- ===== BEGIN supabase/migrations/0008_scope_and_rpc_hardening.sql =====
-- 0008_scope_and_rpc_hardening.sql
-- Tighten scope enforcement for metadata and SECURITY DEFINER business RPCs.

create or replace function public.has_organization_scope()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_scopes rs on rs.user_role_id=ur.id
    where ur.user_id=auth.uid()
      and ur.organization_id=public.current_org_id()
      and rs.scope_type='organization'
      and rs.scope_id is null
  );
$$;

-- Opening cycles is an HR/organization-level operation, not a branch/department evaluator operation.
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id=r.id and rp.permission_id=p.id
  and r.organization_id is null
  and r.code in ('branch_manager','department_manager','supervisor')
  and p.code='evaluations.create';

-- RBAC metadata: custom role permissions/scopes must stay inside the current organization.
drop policy if exists role_permissions_manage on public.role_permissions;
create policy role_permissions_manage on public.role_permissions
for all to authenticated
using (
  public.has_permission('roles.manage') and exists(
    select 1 from public.roles r
    where r.id=role_id and r.organization_id=public.current_org_id() and not r.is_system
  )
)
with check (
  public.has_permission('roles.manage') and exists(
    select 1 from public.roles r
    where r.id=role_id and r.organization_id=public.current_org_id() and not r.is_system
  )
);

drop policy if exists role_scopes_manage on public.role_scopes;
create policy role_scopes_manage on public.role_scopes
for all to authenticated
using (
  public.has_permission('roles.manage') and exists(
    select 1 from public.user_roles ur where ur.id=user_role_id and ur.organization_id=public.current_org_id()
  )
)
with check (
  public.has_permission('roles.manage')
  and exists(select 1 from public.user_roles ur where ur.id=user_role_id and ur.organization_id=public.current_org_id())
  and (
    (scope_type in ('organization','assigned_employees') and scope_id is null)
    or (scope_type='branch' and exists(select 1 from public.branches b where b.id=scope_id and b.organization_id=public.current_org_id()))
    or (scope_type='department' and exists(select 1 from public.departments d where d.id=scope_id and d.organization_id=public.current_org_id()))
  )
);

-- Organization structure writes must honor the user's scope.
drop policy if exists branches_insert on public.branches;
create policy branches_insert on public.branches for insert to authenticated
with check (organization_id=public.current_org_id() and public.has_permission('branches.manage') and public.has_organization_scope());

drop policy if exists branches_update on public.branches;
create policy branches_update on public.branches for update to authenticated
using (organization_id=public.current_org_id() and public.has_permission('branches.manage') and public.can_access_branch(id))
with check (organization_id=public.current_org_id());

drop policy if exists departments_insert on public.departments;
create policy departments_insert on public.departments for insert to authenticated
with check (
  organization_id=public.current_org_id() and public.has_permission('departments.manage') and (
    (branch_id is null and public.has_organization_scope()) or
    (branch_id is not null and public.can_access_branch(branch_id))
  )
);

drop policy if exists departments_update on public.departments;
create policy departments_update on public.departments for update to authenticated
using (organization_id=public.current_org_id() and public.has_permission('departments.manage') and public.can_access_department(id))
with check (organization_id=public.current_org_id());

drop policy if exists sections_manage on public.sections;
create policy sections_manage on public.sections for all to authenticated
using (organization_id=public.current_org_id() and public.has_permission('sections.manage') and public.can_access_department(department_id))
with check (organization_id=public.current_org_id() and public.has_permission('sections.manage') and public.can_access_department(department_id));

-- Criteria mapping must not reference another organization's templates/criteria.
drop policy if exists template_criteria_manage on public.template_criteria;
create policy template_criteria_manage on public.template_criteria for all to authenticated
using (
  public.has_permission('criteria.manage') and exists(
    select 1 from public.evaluation_templates t where t.id=template_id and t.organization_id=public.current_org_id()
  )
)
with check (
  public.has_permission('criteria.manage')
  and exists(select 1 from public.evaluation_templates t where t.id=template_id and t.organization_id=public.current_org_id())
  and exists(select 1 from public.evaluation_criteria c where c.id=criterion_id and c.organization_id=public.current_org_id())
);

-- Evaluation exclusions are managerial metadata and must obey employee scope.
drop policy if exists exclusions_select on public.evaluation_exclusions;
create policy exclusions_select on public.evaluation_exclusions for select to authenticated
using (public.has_permission('evaluations.view') and public.can_access_employee(employee_id));

-- Direct evaluation/answer writes must honor employee scope (RPCs enforce the same rules).
drop policy if exists evaluations_insert on public.evaluations;
create policy evaluations_insert on public.evaluations for insert to authenticated
with check (
  public.can_access_employee(employee_id) and (
    (evaluator_user_id=auth.uid() and public.has_permission('evaluations.create'))
    or public.has_permission('evaluations.edit')
  )
);

drop policy if exists answers_manage on public.evaluation_answers;
create policy answers_manage on public.evaluation_answers for all to authenticated
using (
  exists(
    select 1 from public.evaluations e
    where e.id=evaluation_id and e.status='draft'
      and public.has_permission('evaluations.edit')
      and public.can_access_employee(e.employee_id)
  )
)
with check (
  exists(
    select 1 from public.evaluations e
    where e.id=evaluation_id and e.status='draft'
      and public.has_permission('evaluations.edit')
      and public.can_access_employee(e.employee_id)
  )
);

-- Branch target visibility requires the targets permission AND branch scope.
drop policy if exists branch_targets_select on public.branch_targets;
create policy branch_targets_select on public.branch_targets for select to authenticated
using (organization_id=public.current_org_id() and public.has_permission('targets.view') and public.can_access_branch(branch_id));

-- Harden workflow transitions with scope on lock/reopen as well.
create or replace function public.transition_evaluation(p_evaluation uuid,p_to public.evaluation_status,p_reason text default null)
returns public.evaluation_status
language plpgsql security definer set search_path=public as $$
declare e public.evaluations%rowtype; v_snapshot jsonb;
begin
  select * into e from public.evaluations where id=p_evaluation for update;
  if e.id is null then raise exception 'evaluation_not_found'; end if;

  if p_to='submitted' then
    if e.status<>'draft' or e.evaluator_user_id<>auth.uid() or not public.has_permission('evaluations.submit') then raise exception 'invalid_transition'; end if;
    if public.recalculate_evaluation(e.id) is null then raise exception 'evaluation_incomplete'; end if;
    update public.evaluations set status='submitted',submitted_at=now() where id=e.id;
  elsif p_to='reviewed' then
    if e.status<>'submitted' or not public.has_permission('evaluations.review') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='reviewed',reviewed_at=now(),reviewed_by=auth.uid() where id=e.id;
  elsif p_to='approved' then
    if e.status not in ('submitted','reviewed') or not public.has_permission('evaluations.approve') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='approved',approved_at=now(),approved_by=auth.uid() where id=e.id;
  elsif p_to='published' then
    if e.status<>'approved' or not public.has_permission('evaluations.publish') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='published',published_at=now(),published_by=auth.uid() where id=e.id;
    insert into public.notifications(organization_id,user_id,title,body,kind,entity_type,entity_id)
    select emp.organization_id,p.id,'تم نشر تقييمك','أصبح تقييمك متاحًا في بوابة الموظف.','evaluation_published','evaluation',e.id
    from public.employees emp join public.profiles p on p.employee_id=emp.id where emp.id=e.employee_id;
  elsif p_to='locked' then
    if e.status<>'published' or not public.has_permission('evaluations.approve') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='locked',locked_at=now() where id=e.id;
  elsif p_to='draft' then
    if e.status not in ('submitted','reviewed','approved','published','locked') or not public.has_permission('evaluations.reopen') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    if p_reason is null or length(trim(p_reason))<3 then raise exception 'reopen_reason_required'; end if;
    select jsonb_build_object('evaluation',to_jsonb(e),'answers',coalesce((select jsonb_agg(to_jsonb(a)) from public.evaluation_answers a where a.evaluation_id=e.id),'[]'::jsonb)) into v_snapshot;
    insert into public.evaluation_versions(evaluation_id,version,snapshot,reason,created_by) values(e.id,e.version,v_snapshot,p_reason,auth.uid()) on conflict do nothing;
    update public.evaluations set status='draft',version=version+1,reopened_at=now(),reopened_by=auth.uid(),reopen_reason=p_reason,
      submitted_at=null,reviewed_at=null,reviewed_by=null,approved_at=null,approved_by=null,published_at=null,published_by=null,locked_at=null where id=e.id;
  else
    raise exception 'unsupported_transition';
  end if;

  perform public.audit_event('evaluation.transition','evaluation',e.id,jsonb_build_object('status',e.status),jsonb_build_object('status',p_to),p_reason);
  return p_to;
end;
$$;

-- Validate cycle ownership inside SECURITY DEFINER target/attendance RPCs.
create or replace function public.upsert_sales_target(
  p_cycle uuid,p_employee uuid,p_target numeric,p_achieved numeric,p_reason text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare oldrow public.sales_targets%rowtype; emp public.employees%rowtype; v_id uuid; v_cycle_org uuid;
begin
  if not public.has_permission('targets.manage') or not public.can_access_employee(p_employee) then raise exception 'permission_denied'; end if;
  if p_target<=0 or p_achieved<0 then raise exception 'invalid_amount'; end if;
  select organization_id into v_cycle_org from public.evaluation_cycles where id=p_cycle;
  if v_cycle_org is null or v_cycle_org<>public.current_org_id() then raise exception 'cycle_not_found'; end if;
  select * into emp from public.employees where id=p_employee and organization_id=public.current_org_id();
  if emp.id is null then raise exception 'employee_not_found'; end if;
  select * into oldrow from public.sales_targets where cycle_id=p_cycle and employee_id=p_employee for update;
  if oldrow.id is not null and oldrow.target_amount<>p_target and nullif(trim(p_reason),'') is null then raise exception 'target_change_reason_required'; end if;
  insert into public.sales_targets(organization_id,cycle_id,employee_id,branch_id,department_id,target_amount,achieved_amount,last_edit_reason,created_by)
  values(emp.organization_id,p_cycle,p_employee,emp.branch_id,emp.department_id,p_target,p_achieved,p_reason,auth.uid())
  on conflict (cycle_id,employee_id) do update set target_amount=excluded.target_amount,achieved_amount=excluded.achieved_amount,last_edit_reason=excluded.last_edit_reason,updated_at=now()
  returning id into v_id;
  perform public.audit_event('sales_target.upsert','sales_target',v_id,case when oldrow.id is null then null else to_jsonb(oldrow) end,
    (select to_jsonb(s) from public.sales_targets s where s.id=v_id),p_reason);
  return v_id;
end;
$$;

create or replace function public.save_attendance_evaluation(
  p_cycle uuid,p_employee uuid,p_notes text,p_entries jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; item jsonb; pt public.attendance_penalty_types%rowtype; total numeric:=0; occ integer; v_cycle_org uuid;
begin
  if not public.has_permission('attendance.manage') or not public.can_access_employee(p_employee) then raise exception 'permission_denied'; end if;
  select organization_id into v_cycle_org from public.evaluation_cycles where id=p_cycle;
  if v_cycle_org is null or v_cycle_org<>public.current_org_id() then raise exception 'cycle_not_found'; end if;
  insert into public.attendance_evaluations(cycle_id,employee_id,base_score,final_score,notes,evaluator_user_id)
  values(p_cycle,p_employee,100,100,p_notes,auth.uid())
  on conflict (cycle_id,employee_id) do update set notes=excluded.notes,evaluator_user_id=auth.uid(),updated_at=now()
  returning id into v_id;
  delete from public.attendance_penalty_entries where attendance_evaluation_id=v_id;
  for item in select * from jsonb_array_elements(coalesce(p_entries,'[]'::jsonb)) loop
    select * into pt from public.attendance_penalty_types where id=(item->>'penalty_type_id')::uuid and organization_id=public.current_org_id() and active;
    if pt.id is null then raise exception 'invalid_penalty_type'; end if;
    occ=greatest(0,coalesce((item->>'occurrences')::integer,0));
    total=total+(occ*pt.deduction_points);
    insert into public.attendance_penalty_entries(attendance_evaluation_id,penalty_type_id,occurrences,deduction_points_snapshot,note)
    values(v_id,pt.id,occ,pt.deduction_points,nullif(item->>'note',''));
  end loop;
  update public.attendance_evaluations set final_score=greatest(0,100-total) where id=v_id;
  perform public.audit_event('attendance.save','attendance_evaluation',v_id,null,jsonb_build_object('final_score',greatest(0,100-total)),null);
  return v_id;
end;
$$;

-- Transfer targets must belong to the same organization as the employee.
create or replace function public.transfer_employee(
  p_employee uuid,p_branch uuid,p_department uuid,p_section uuid,p_job_title uuid,p_manager uuid,p_supervisor uuid,p_reason text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare olde public.employees%rowtype; v_assignment uuid; v_org uuid:=public.current_org_id();
begin
  if not public.has_permission('employees.update') or not public.can_access_employee(p_employee) then raise exception 'permission_denied'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  select * into olde from public.employees where id=p_employee and organization_id=v_org for update;
  if olde.id is null then raise exception 'employee_not_found'; end if;
  if p_branch is not null and not exists(select 1 from public.branches b where b.id=p_branch and b.organization_id=v_org and b.deleted_at is null) then raise exception 'invalid_branch'; end if;
  if p_department is not null and not exists(select 1 from public.departments d where d.id=p_department and d.organization_id=v_org and d.deleted_at is null) then raise exception 'invalid_department'; end if;
  if p_section is not null and not exists(select 1 from public.sections s where s.id=p_section and s.organization_id=v_org and s.deleted_at is null) then raise exception 'invalid_section'; end if;
  if p_job_title is not null and not exists(select 1 from public.job_titles j where j.id=p_job_title and j.organization_id=v_org and j.deleted_at is null) then raise exception 'invalid_job_title'; end if;
  if p_manager is not null and not exists(select 1 from public.employees e where e.id=p_manager and e.organization_id=v_org and e.deleted_at is null) then raise exception 'invalid_manager'; end if;
  if p_supervisor is not null and not exists(select 1 from public.employees e where e.id=p_supervisor and e.organization_id=v_org and e.deleted_at is null) then raise exception 'invalid_supervisor'; end if;
  if p_department is not null and p_branch is not null and exists(select 1 from public.departments d where d.id=p_department and d.branch_id is not null and d.branch_id<>p_branch) then raise exception 'department_branch_mismatch'; end if;
  if p_section is not null and p_department is not null and exists(select 1 from public.sections s where s.id=p_section and s.department_id<>p_department) then raise exception 'section_department_mismatch'; end if;

  update public.employee_assignments set is_current=false,effective_to=current_date where employee_id=p_employee and is_current;
  insert into public.employee_assignments(employee_id,branch_id,department_id,section_id,job_title_id,manager_id,supervisor_id,effective_from,reason,is_current,created_by)
  values(p_employee,p_branch,p_department,p_section,p_job_title,p_manager,p_supervisor,current_date,p_reason,true,auth.uid()) returning id into v_assignment;
  if olde.manager_id is distinct from p_manager then
    insert into public.employee_manager_history(employee_id,old_manager_id,new_manager_id,reason,changed_by) values(p_employee,olde.manager_id,p_manager,p_reason,auth.uid());
  end if;
  update public.employees set branch_id=p_branch,department_id=p_department,section_id=p_section,job_title_id=p_job_title,manager_id=p_manager,supervisor_id=p_supervisor where id=p_employee;
  perform public.audit_event('employee.transfer','employee',p_employee,to_jsonb(olde),(select to_jsonb(e) from public.employees e where e.id=p_employee),p_reason);
  return v_assignment;
end;
$$;

create or replace function public.disable_branch(p_branch uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare c integer;
begin
  if not public.has_permission('branches.manage') or not public.can_access_branch(p_branch) then raise exception 'permission_denied'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;
  if not exists(select 1 from public.branches where id=p_branch and organization_id=public.current_org_id()) then raise exception 'branch_not_found'; end if;
  select count(*) into c from public.employees where branch_id=p_branch and organization_id=public.current_org_id() and deleted_at is null and status='active';
  if c>0 then
    update public.branches set active=false where id=p_branch and organization_id=public.current_org_id();
  else
    update public.branches set active=false,deleted_at=coalesce(deleted_at,now()) where id=p_branch and organization_id=public.current_org_id();
  end if;
  perform public.audit_event('branch.disable','branch',p_branch,null,jsonb_build_object('active',false,'active_employees',c),p_reason);
end;
$$;

-- ===== END supabase/migrations/0008_scope_and_rpc_hardening.sql =====

-- ===== BEGIN supabase/migrations/0009_attendance_detail_visibility.sql =====
-- Keep attendance penalty details private until the parent attendance evaluation is published/locked.
-- Managers/HR with attendance.view still need employee scope.
drop policy if exists attendance_entries_select on public.attendance_penalty_entries;
create policy attendance_entries_select on public.attendance_penalty_entries
for select to authenticated
using (
  exists (
    select 1
    from public.attendance_evaluations ae
    where ae.id=attendance_evaluation_id
      and (
        (ae.employee_id=public.current_employee_id() and ae.status in ('published','locked'))
        or (public.has_permission('attendance.view') and public.can_access_employee(ae.employee_id))
      )
  )
);

-- ===== END supabase/migrations/0009_attendance_detail_visibility.sql =====

-- ===== BEGIN supabase/migrations/0010_operational_settings_visibility.sql =====
-- Operational defaults are safe to read by authenticated users in the same organization.
-- Other settings remain restricted to settings.manage through the existing policy.
create policy settings_operational_select on public.system_settings
for select to authenticated
using (
  organization_id=public.current_org_id()
  and key in ('sales_target_default','branch_target_mode')
);

-- ===== END supabase/migrations/0010_operational_settings_visibility.sql =====

-- ===== BEGIN supabase/migrations/0011_required_comments_on_submit.sql =====
-- Enforce required criterion comments at the database workflow boundary, not only in the UI.
create or replace function public.transition_evaluation(p_evaluation uuid,p_to public.evaluation_status,p_reason text default null)
returns public.evaluation_status
language plpgsql security definer set search_path=public as $$
declare e public.evaluations%rowtype; v_snapshot jsonb;
begin
  select * into e from public.evaluations where id=p_evaluation for update;
  if e.id is null then raise exception 'evaluation_not_found'; end if;

  if p_to='submitted' then
    if e.status<>'draft' or e.evaluator_user_id<>auth.uid() or not public.has_permission('evaluations.submit') then raise exception 'invalid_transition'; end if;
    if public.recalculate_evaluation(e.id) is null then raise exception 'evaluation_incomplete'; end if;
    if exists(
      select 1
      from public.template_criteria tc
      left join public.evaluation_answers a on a.evaluation_id=e.id and a.criterion_id=tc.criterion_id
      where tc.template_id=e.template_id
        and tc.mandatory
        and (a.id is null or (tc.comment_required and nullif(trim(a.comment),'') is null))
    ) then raise exception 'required_comment_missing'; end if;
    update public.evaluations set status='submitted',submitted_at=now() where id=e.id;
  elsif p_to='reviewed' then
    if e.status<>'submitted' or not public.has_permission('evaluations.review') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='reviewed',reviewed_at=now(),reviewed_by=auth.uid() where id=e.id;
  elsif p_to='approved' then
    if e.status not in ('submitted','reviewed') or not public.has_permission('evaluations.approve') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='approved',approved_at=now(),approved_by=auth.uid() where id=e.id;
  elsif p_to='published' then
    if e.status<>'approved' or not public.has_permission('evaluations.publish') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='published',published_at=now(),published_by=auth.uid() where id=e.id;
    insert into public.notifications(organization_id,user_id,title,body,kind,entity_type,entity_id)
    select emp.organization_id,p.id,'تم نشر تقييمك','أصبح تقييمك متاحًا في بوابة الموظف.','evaluation_published','evaluation',e.id
    from public.employees emp join public.profiles p on p.employee_id=emp.id where emp.id=e.employee_id;
  elsif p_to='locked' then
    if e.status<>'published' or not public.has_permission('evaluations.approve') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    update public.evaluations set status='locked',locked_at=now() where id=e.id;
  elsif p_to='draft' then
    if e.status not in ('submitted','reviewed','approved','published','locked') or not public.has_permission('evaluations.reopen') or not public.can_access_employee(e.employee_id) then raise exception 'invalid_transition'; end if;
    if p_reason is null or length(trim(p_reason))<3 then raise exception 'reopen_reason_required'; end if;
    select jsonb_build_object('evaluation',to_jsonb(e),'answers',coalesce((select jsonb_agg(to_jsonb(a)) from public.evaluation_answers a where a.evaluation_id=e.id),'[]'::jsonb)) into v_snapshot;
    insert into public.evaluation_versions(evaluation_id,version,snapshot,reason,created_by) values(e.id,e.version,v_snapshot,p_reason,auth.uid()) on conflict do nothing;
    update public.evaluations set status='draft',version=version+1,reopened_at=now(),reopened_by=auth.uid(),reopen_reason=p_reason,
      submitted_at=null,reviewed_at=null,reviewed_by=null,approved_at=null,approved_by=null,published_at=null,published_by=null,locked_at=null where id=e.id;
  else
    raise exception 'unsupported_transition';
  end if;

  perform public.audit_event('evaluation.transition','evaluation',e.id,jsonb_build_object('status',e.status),jsonb_build_object('status',p_to),p_reason);
  return p_to;
end;
$$;

-- ===== END supabase/migrations/0011_required_comments_on_submit.sql =====

-- ===== BEGIN neon/migrations/0012_neon_data_api_grants.sql =====
-- Grants used by Neon Data API. RLS remains the authorization boundary.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select, update on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select, update on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;

-- No application data is exposed to anonymous users by default.
revoke all on all tables in schema public from anonymous;
revoke all on all sequences in schema public from anonymous;

-- ===== END neon/migrations/0012_neon_data_api_grants.sql =====

-- ===== BEGIN supabase/seed.sql =====
-- Generated from the attached legacy HTML. Re-runnable and idempotent.
begin;
insert into public.organizations(id,name,code) values('00000000-0000-0000-0000-000000000001','السويد','ALSUWAID') on conflict (id) do update set name=excluded.name;
insert into public.branches(id,organization_id,name,code,city,active) values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','غير محدد - بيانات مرحّلة','LEGACY-UNASSIGNED',null,true) on conflict (organization_id,code) do nothing;
insert into public.departments(id,organization_id,branch_id,name,code,active) values('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000101','غير محدد - بيانات مرحّلة','LEGACY-UNASSIGNED',true) on conflict (organization_id,branch_id,code) do nothing;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','أخصائي عمليات الموارد البشرية','LEGACY-JT-001') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','أخصائي مشتريات','LEGACY-JT-002') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','أمين مستودع رئيسي','LEGACY-JT-003') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','أمين مستودع فرعي','LEGACY-JT-004') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','الرئيس التنفيذي','LEGACY-JT-005') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','المدير المالي','LEGACY-JT-006') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','بائع','LEGACY-JT-007') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','بائع خدمة ذاتية','LEGACY-JT-008') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','خدمة عملاء','LEGACY-JT-009') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','سائق','LEGACY-JT-010') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','صانع محتوى','LEGACY-JT-011') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','عامل مستودع رئيسي','LEGACY-JT-012') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','عامل مستودع فرعي','LEGACY-JT-013') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','فني تركيب','LEGACY-JT-014') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','كاتب محتوى وأخصائي SEO','LEGACY-JT-015') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','محاسب الإيرادات','LEGACY-JT-016') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','محاسب المصروفات','LEGACY-JT-017') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','محاسب مراقبة المخزون','LEGACY-JT-018') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','محاسب مستودع فرعي','LEGACY-JT-019') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مدير التسويق الإلكتروني','LEGACY-JT-020') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مدير المبيعات والتسويق','LEGACY-JT-021') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مدير الموارد البشرية','LEGACY-JT-022') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مدير عمليات المتجر الإلكتروني','LEGACY-JT-023') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مدير فرع','LEGACY-JT-024') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مدير قسم منتجات الكهرباء','LEGACY-JT-025') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مدير مستودع رئيسي','LEGACY-JT-026') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مراقب موارد بشرية','LEGACY-JT-027') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مشرف الدعم التقني','LEGACY-JT-028') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مشرف خدمة عملاء الفروع','LEGACY-JT-029') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مشرف خدمة عملاء المتجر الإلكتروني','LEGACY-JT-030') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مشرف صيانة','LEGACY-JT-031') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مشرف قسم الحركة والنقل','LEGACY-JT-032') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مشرف مستودع رئيسي','LEGACY-JT-033') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مصمم جرافيك ومسؤول إضافة منتجات','LEGACY-JT-034') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','مندوب مشتريات منتجات الكهرباء','LEGACY-JT-035') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','منسق شؤون حكومية','LEGACY-JT-036') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن','LEGACY-JT-037') on conflict (organization_id,name) do update set active=true;
insert into public.job_titles(organization_id,name,code) values('00000000-0000-0000-0000-000000000001','نائب مدير المبيعات والتسويق','LEGACY-JT-038') on conflict (organization_id,name) do update set active=true;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-001','إبراهيم اسماعيل','إبراهيم اسماعيل','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='فني تركيب' limit 1),'إبراهيم اسماعيل') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-002','ابراهيم سعود ناصر الحوطي','ابراهيم سعود ناصر الحوطي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'ابراهيم سعود ناصر الحوطي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-003','ابراهيم عبدالله صالح العليان','ابراهيم عبدالله صالح العليان','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'ابراهيم عبدالله صالح العليان') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-004','ابراهيم علي عبد العليم النادي','ابراهيم علي عبد العليم النادي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'ابراهيم علي عبد العليم النادي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-005','ابراهيم فهد عبدالعزيز المهنا','ابراهيم فهد عبدالعزيز المهنا','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير فرع' limit 1),'ابراهيم فهد عبدالعزيز المهنا') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-006','إبراهيم كوري تراوري','إبراهيم كوري تراوري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب مستودع فرعي' limit 1),'إبراهيم كوري تراوري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-007','ابراهيم محمد أحمد رحمة الله','ابراهيم محمد أحمد رحمة الله','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),'ابراهيم محمد أحمد رحمة الله') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-008','احمد ابراهيم فتحي بريقع','احمد ابراهيم فتحي بريقع','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'احمد ابراهيم فتحي بريقع') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-009','أحمد جمال العبيدي','أحمد جمال العبيدي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير التسويق الإلكتروني' limit 1),'أحمد جمال العبيدي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-010','احمد وجيه ناصف','احمد وجيه ناصف','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='كاتب محتوى وأخصائي SEO' limit 1),'احمد وجيه ناصف') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-011','اسامة عبدالله محمد التويجري','اسامة عبدالله محمد التويجري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'اسامة عبدالله محمد التويجري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-012','اسلام احمد خليفة احمد','اسلام احمد خليفة احمد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب المصروفات' limit 1),'اسلام احمد خليفة احمد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-013','السيد عبدالرحمن عبدالرحمن الصردي','السيد عبدالرحمن عبدالرحمن الصردي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'السيد عبدالرحمن عبدالرحمن الصردي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-014','الوليد عبد الرحمن عبدالله الزارع','الوليد عبد الرحمن عبدالله الزارع','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير فرع' limit 1),'الوليد عبد الرحمن عبدالله الزارع') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-015','امام حسين','امام حسين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'امام حسين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-016','أمل','أمل','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='خدمة عملاء' limit 1),'أمل') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-017','امين الله شاكر الله','امين الله شاكر الله','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أمين مستودع رئيسي' limit 1),'امين الله شاكر الله') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-018','برهان خان محمد خان','برهان خان محمد خان','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'برهان خان محمد خان') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-019','تورخان شاه زمان خان','تورخان شاه زمان خان','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),'تورخان شاه زمان خان') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-020','جاكر حسين','جاكر حسين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'جاكر حسين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-021','جهاد الدين علي ضياء الدين','جهاد الدين علي ضياء الدين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'جهاد الدين علي ضياء الدين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-022','حبيب ناظر عبدالواحد عبده','حبيب ناظر عبدالواحد عبده','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مصمم جرافيك ومسؤول إضافة منتجات' limit 1),'حبيب ناظر عبدالواحد عبده') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-023','حسام حيدر يوسف العبيد','حسام حيدر يوسف العبيد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف الدعم التقني' limit 1),'حسام حيدر يوسف العبيد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-024','حسان ابراهيم عبدالله السويد','حسان ابراهيم عبدالله السويد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير فرع' limit 1),'حسان ابراهيم عبدالله السويد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-025','حمادة محمد عبدالجواد مصطفى','حمادة محمد عبدالجواد مصطفى','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب الإيرادات' limit 1),'حمادة محمد عبدالجواد مصطفى') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-026','حمد مصطفي بسطاوي محمد','حمد مصطفي بسطاوي محمد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='منسق شؤون حكومية' limit 1),'حمد مصطفي بسطاوي محمد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-027','خالد خان خان زاده','خالد خان خان زاده','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'خالد خان خان زاده') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-028','خالد رمضان حسن علي','خالد رمضان حسن علي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'خالد رمضان حسن علي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-029','رحيم الله شاكر الله','رحيم الله شاكر الله','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'رحيم الله شاكر الله') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-030','رضا عبدالقادر ابراهيم الحنفي','رضا عبدالقادر ابراهيم الحنفي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'رضا عبدالقادر ابراهيم الحنفي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-031','سامي عبدالرحمن الجاسر','سامي عبدالرحمن الجاسر','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مراقب موارد بشرية' limit 1),'سامي عبدالرحمن الجاسر') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-032','سلمان خان','سلمان خان','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'سلمان خان') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-033','سليمان عبد الله سليمان التويجري','سليمان عبد الله سليمان التويجري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مندوب مشتريات منتجات الكهرباء' limit 1),'سليمان عبد الله سليمان التويجري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-034','سليمان عبدالله خريف الخريف','سليمان عبدالله خريف الخريف','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'سليمان عبدالله خريف الخريف') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-035','سميع الله نو','سميع الله نو','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'سميع الله نو') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-036','شاكر حسين','شاكر حسين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف مستودع رئيسي' limit 1),'شاكر حسين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-037','شاه فهد أخلاق','شاه فهد أخلاق','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'شاه فهد أخلاق') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-038','عابد محمد محمد دين توباسوم','عابد محمد محمد دين توباسوم','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أمين مستودع رئيسي' limit 1),'عابد محمد محمد دين توباسوم') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-039','عبد العزيز الشبرمي','عبد العزيز الشبرمي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير عمليات المتجر الإلكتروني' limit 1),'عبد العزيز الشبرمي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-040','عبدالعزيز إسماعيل','عبدالعزيز إسماعيل','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='فني تركيب' limit 1),'عبدالعزيز إسماعيل') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-041','عبدالعزيز محمد حسن عبدالعزيز','عبدالعزيز محمد حسن عبدالعزيز','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير فرع' limit 1),'عبدالعزيز محمد حسن عبدالعزيز') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-042','عبدالله السنيدي','عبدالله السنيدي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='صانع محتوى' limit 1),'عبدالله السنيدي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-043','عبدالله تيسير علي الأطرش','عبدالله تيسير علي الأطرش','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف صيانة' limit 1),'عبدالله تيسير علي الأطرش') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-044','عبدالله سالم حسن الحنيني','عبدالله سالم حسن الحنيني','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أخصائي عمليات الموارد البشرية' limit 1),'عبدالله سالم حسن الحنيني') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-045','عبدالله عبدالرحمن عبدالله البشري','عبدالله عبدالرحمن عبدالله البشري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن' limit 1),'عبدالله عبدالرحمن عبدالله البشري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-046','عبدالله محمد اسلم خان','عبدالله محمد اسلم خان','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'عبدالله محمد اسلم خان') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-047','عبدلله ابراهيم ابراهيم شمس الدين','عبدلله ابراهيم ابراهيم شمس الدين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'عبدلله ابراهيم ابراهيم شمس الدين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-048','عدنان خان صافي الله','عدنان خان صافي الله','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'عدنان خان صافي الله') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-049','عدنان محمد ارشد محمد ايوب أيوب','عدنان محمد ارشد محمد ايوب أيوب','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'عدنان محمد ارشد محمد ايوب أيوب') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-050','عدي عوض الكريم محمد دفع الله','عدي عوض الكريم محمد دفع الله','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف خدمة عملاء المتجر الإلكتروني' limit 1),'عدي عوض الكريم محمد دفع الله') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-051','عرفان حسين مزمل حسن','عرفان حسين مزمل حسن','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'عرفان حسين مزمل حسن') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-052','عزام عبدالله محمد السويد','عزام عبدالله محمد السويد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'عزام عبدالله محمد السويد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-053','علي احمد راشد احمد','علي احمد راشد احمد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'علي احمد راشد احمد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-054','علي بدر علي الجربوع','علي بدر علي الجربوع','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع خدمة ذاتية' limit 1),'علي بدر علي الجربوع') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-055','على حمد صالح الخطيب','على حمد صالح الخطيب','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف خدمة عملاء الفروع' limit 1),'على حمد صالح الخطيب') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-056','عمار عبدالكريم البرادي','عمار عبدالكريم البرادي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'عمار عبدالكريم البرادي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-057','عمر شاهين محمد سيد','عمر شاهين محمد سيد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف مستودع رئيسي' limit 1),'عمر شاهين محمد سيد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-058','عمران أحمد أنصاري','عمران أحمد أنصاري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'عمران أحمد أنصاري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-059','عمران احمد معين الدين','عمران احمد معين الدين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف مستودع رئيسي' limit 1),'عمران احمد معين الدين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-060','غلام نابي محمد دين','غلام نابي محمد دين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),'غلام نابي محمد دين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-061','فني تركيب','فني تركيب','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',null,'فني تركيب') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-062','متيار خان','متيار خان','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'متيار خان') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-063','مجتبى لطيف','مجتبى لطيف','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'مجتبى لطيف') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-064','محمد ابجال انصاري افضل','محمد ابجال انصاري افضل','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'محمد ابجال انصاري افضل') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-065','محمد ارشد اسحاق نظام الدين','محمد ارشد اسحاق نظام الدين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أمين مستودع فرعي' limit 1),'محمد ارشد اسحاق نظام الدين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-066','محمد اشرف صابر سليمان','محمد اشرف صابر سليمان','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'محمد اشرف صابر سليمان') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-067','محمد البشير الكباشي الشيخ','محمد البشير الكباشي الشيخ','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أخصائي مشتريات' limit 1),'محمد البشير الكباشي الشيخ') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-068','محمد السيد محمد دسوقي','محمد السيد محمد دسوقي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'محمد السيد محمد دسوقي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-069','محمد أيوب انصاري','محمد أيوب انصاري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'محمد أيوب انصاري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-070','محمد حسن مير حسن','محمد حسن مير حسن','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),'محمد حسن مير حسن') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-071','محمد خالد عبدالرحمن السويد','محمد خالد عبدالرحمن السويد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='نائب مدير المبيعات والتسويق' limit 1),'محمد خالد عبدالرحمن السويد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-072','محمد روبيل','محمد روبيل','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'محمد روبيل') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-073','محمد سجاد محمد عليم','محمد سجاد محمد عليم','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'محمد سجاد محمد عليم') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-074','محمد سليمان عبدالله السويد','محمد سليمان عبدالله السويد','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='الرئيس التنفيذي' limit 1),'محمد سليمان عبدالله السويد') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-075','محمد سليمان محمد العقيل','محمد سليمان محمد العقيل','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'محمد سليمان محمد العقيل') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-076','محمد سمان محمد ليم','محمد سمان محمد ليم','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),'محمد سمان محمد ليم') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-077','محمد صابر سعد ابو مسلم','محمد صابر سعد ابو مسلم','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير المبيعات والتسويق' limit 1),'محمد صابر سعد ابو مسلم') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-078','محمد عبد العزيز السيد عبد الله','محمد عبد العزيز السيد عبد الله','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'محمد عبد العزيز السيد عبد الله') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-079','محمد عبدالحليم ابراهيم حسن','محمد عبدالحليم ابراهيم حسن','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='المدير المالي' limit 1),'محمد عبدالحليم ابراهيم حسن') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-080','محمد عثمان محمد اسلم','محمد عثمان محمد اسلم','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف قسم الحركة والنقل' limit 1),'محمد عثمان محمد اسلم') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-081','محمد عطيه السيد أبو رواش','محمد عطيه السيد أبو رواش','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'محمد عطيه السيد أبو رواش') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-082','محمد علي عبدالله المطوع','محمد علي عبدالله المطوع','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير مستودع رئيسي' limit 1),'محمد علي عبدالله المطوع') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-083','محمد فوزي الشرباصي الشهاوي','محمد فوزي الشرباصي الشهاوي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب مراقبة المخزون' limit 1),'محمد فوزي الشرباصي الشهاوي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-084','محمد نصر جمشين','محمد نصر جمشين','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),'محمد نصر جمشين') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-085','معاذ عبدالرحمن عبدالله البشري','معاذ عبدالرحمن عبدالله البشري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير الموارد البشرية' limit 1),'معاذ عبدالرحمن عبدالله البشري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-086','منصور احمد منصور','منصور احمد منصور','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير قسم منتجات الكهرباء' limit 1),'منصور احمد منصور') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-087','منى','منى','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='خدمة عملاء' limit 1),'منى') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-088','نبيل محسن','نبيل محسن','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'نبيل محسن') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-089','نصر محمد حبيب الله احمد علي نصر','نصر محمد حبيب الله احمد علي نصر','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع خدمة ذاتية' limit 1),'نصر محمد حبيب الله احمد علي نصر') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-090','نعمان إسحاق','نعمان إسحاق','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),'نعمان إسحاق') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-091','نعيم كهوني قل','نعيم كهوني قل','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'نعيم كهوني قل') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-092','نور الدين حسن حاج علي','نور الدين حسن حاج علي','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أمين مستودع فرعي' limit 1),'نور الدين حسن حاج علي') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-093','هاشم سالم جعفر الكاف','هاشم سالم جعفر الكاف','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'هاشم سالم جعفر الكاف') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-094','هاشم محمد الياس ألياس','هاشم محمد الياس ألياس','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),'هاشم محمد الياس ألياس') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-095','هشام سباعي محمودي سالم','هشام سباعي محمودي سالم','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'هشام سباعي محمودي سالم') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-096','وسيم صالح محمد الخوبري','وسيم صالح محمد الخوبري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),'وسيم صالح محمد الخوبري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
insert into public.employees(organization_id,employee_number,full_name,normalized_name,branch_id,department_id,job_title_id,legacy_source_id) values('00000000-0000-0000-0000-000000000001','LEGACY-097','يزيد إبراهيم فهد الشمري','يزيد إبراهيم فهد الشمري','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000201',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),'يزيد إبراهيم فهد الشمري') on conflict (organization_id,employee_number) do update set full_name=excluded.full_name,job_title_id=excluded.job_title_id;
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدالله السنيدي' and m.full_name='أحمد جمال العبيدي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='احمد وجيه ناصف' and m.full_name='أحمد جمال العبيدي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='حبيب ناظر عبدالواحد عبده' and m.full_name='أحمد جمال العبيدي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عزام عبدالله محمد السويد' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='احمد ابراهيم فتحي بريقع' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='خالد خان خان زاده' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد السيد محمد دسوقي' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='علي بدر علي الجربوع' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد اشرف صابر سليمان' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='نور الدين حسن حاج علي' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='نصر محمد حبيب الله احمد علي نصر' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='نبيل محسن' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='إبراهيم كوري تراوري' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='هاشم محمد الياس ألياس' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='سلمان خان' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عمار عبدالكريم البرادي' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد سليمان محمد العقيل' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='رضا عبدالقادر ابراهيم الحنفي' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='علي احمد راشد احمد' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='مجتبى لطيف' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد سجاد محمد عليم' and m.full_name='ابراهيم فهد عبدالعزيز المهنا';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدالله محمد اسلم خان' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='متيار خان' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='نعيم كهوني قل' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='يزيد إبراهيم فهد الشمري' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عرفان حسين مزمل حسن' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='شاه فهد أخلاق' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='هشام سباعي محمودي سالم' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='ابراهيم علي عبد العليم النادي' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدلله ابراهيم ابراهيم شمس الدين' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='اسامة عبدالله محمد التويجري' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='برهان خان محمد خان' and m.full_name='الوليد عبد الرحمن عبدالله الزارع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عدنان خان صافي الله' and m.full_name='حسان ابراهيم عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='ابراهيم عبدالله صالح العليان' and m.full_name='حسان ابراهيم عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='السيد عبدالرحمن عبدالرحمن الصردي' and m.full_name='حسان ابراهيم عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عدي عوض الكريم محمد دفع الله' and m.full_name='عبد العزيز الشبرمي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='إبراهيم اسماعيل' and m.full_name='عبد العزيز الشبرمي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='منى' and m.full_name='عبد العزيز الشبرمي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='أمل' and m.full_name='عبد العزيز الشبرمي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدالعزيز إسماعيل' and m.full_name='عبد العزيز الشبرمي';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد حسن مير حسن' and m.full_name='عبدالعزيز محمد حسن عبدالعزيز';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد ارشد اسحاق نظام الدين' and m.full_name='عبدالعزيز محمد حسن عبدالعزيز';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد عطيه السيد أبو رواش' and m.full_name='عبدالعزيز محمد حسن عبدالعزيز';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='ابراهيم سعود ناصر الحوطي' and m.full_name='عبدالعزيز محمد حسن عبدالعزيز';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='خالد رمضان حسن علي' and m.full_name='عبدالعزيز محمد حسن عبدالعزيز';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='سميع الله نو' and m.full_name='عبدالعزيز محمد حسن عبدالعزيز';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد البشير الكباشي الشيخ' and m.full_name='عبدالله عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبد العزيز الشبرمي' and m.full_name='عبدالله عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عمران احمد معين الدين' and m.full_name='عبدالله عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='حسام حيدر يوسف العبيد' and m.full_name='عبدالله عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='أحمد جمال العبيدي' and m.full_name='عبدالله عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد علي عبدالله المطوع' and m.full_name='عبدالله عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='جهاد الدين علي ضياء الدين' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد ابجال انصاري افضل' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد أيوب انصاري' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='امين الله شاكر الله' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عابد محمد محمد دين توباسوم' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='رحيم الله شاكر الله' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عدنان محمد ارشد محمد ايوب أيوب' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='جاكر حسين' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='شاكر حسين' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='هاشم سالم جعفر الكاف' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عمران أحمد أنصاري' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='وسيم صالح محمد الخوبري' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='امام حسين' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد روبيل' and m.full_name='عمر شاهين محمد سيد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد عبدالحليم ابراهيم حسن' and m.full_name='محمد سليمان عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='معاذ عبدالرحمن عبدالله البشري' and m.full_name='محمد سليمان عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدالله عبدالرحمن عبدالله البشري' and m.full_name='محمد سليمان عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدالله تيسير علي الأطرش' and m.full_name='محمد سليمان عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد صابر سعد ابو مسلم' and m.full_name='محمد سليمان عبدالله السويد';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد عبد العزيز السيد عبد الله' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='على حمد صالح الخطيب' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدالعزيز محمد حسن عبدالعزيز' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='حسان ابراهيم عبدالله السويد' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد خالد عبدالرحمن السويد' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='ابراهيم فهد عبدالعزيز المهنا' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='سليمان عبدالله خريف الخريف' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='الوليد عبد الرحمن عبدالله الزارع' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='منصور احمد منصور' and m.full_name='محمد صابر سعد ابو مسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد فوزي الشرباصي الشهاوي' and m.full_name='محمد عبدالحليم ابراهيم حسن';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='حمادة محمد عبدالجواد مصطفى' and m.full_name='محمد عبدالحليم ابراهيم حسن';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='اسلام احمد خليفة احمد' and m.full_name='محمد عبدالحليم ابراهيم حسن';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='ابراهيم محمد أحمد رحمة الله' and m.full_name='محمد عثمان محمد اسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='غلام نابي محمد دين' and m.full_name='محمد عثمان محمد اسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد سمان محمد ليم' and m.full_name='محمد عثمان محمد اسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد نصر جمشين' and m.full_name='محمد عثمان محمد اسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='تورخان شاه زمان خان' and m.full_name='محمد عثمان محمد اسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='نعمان إسحاق' and m.full_name='محمد عثمان محمد اسلم';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='محمد عثمان محمد اسلم' and m.full_name='محمد علي عبدالله المطوع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عمر شاهين محمد سيد' and m.full_name='محمد علي عبدالله المطوع';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='حمد مصطفي بسطاوي محمد' and m.full_name='معاذ عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='عبدالله سالم حسن الحنيني' and m.full_name='معاذ عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='سامي عبدالرحمن الجاسر' and m.full_name='معاذ عبدالرحمن عبدالله البشري';
update public.employees e set manager_id=m.id from public.employees m where e.organization_id='00000000-0000-0000-0000-000000000001' and m.organization_id=e.organization_id and e.full_name='سليمان عبد الله سليمان التويجري' and m.full_name='منصور احمد منصور';
insert into public.employee_assignments(employee_id,branch_id,department_id,job_title_id,manager_id,supervisor_id,effective_from,reason,is_current) select e.id,e.branch_id,e.department_id,e.job_title_id,e.manager_id,e.supervisor_id,current_date,'ترحيل من نظام HTML القديم',true from public.employees e where e.organization_id='00000000-0000-0000-0000-000000000001' on conflict (employee_id) where is_current do nothing;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q1','مدى التزام الموظف بالحضور والانضباط والأنظمة والسياسات المعتمدة.','الحضور والانصراف في وقتهما وتسجيل البصمة عبر تطبيق جسر دون نسيان، وتقديم طلبات الإجازة والاستئذان مسبقاً بوقت كافٍ، والالتزام بسياسات الشركة ولوائحها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q2','جودة ودقة العمل المنجز وقدرته على إنجاز المهام المطلوبة بكفاءة.','إتقان المهام وخلوّها من الأخطاء، وإنجازها بالجودة المطلوبة دون الحاجة لإعادة العمل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q3','التعاون والعمل بروح الفريق والتعامل الإيجابي مع الزملاء والعملاء.','التعاون مع الزملاء، والمشاركة الفعّالة في العمل الجماعي، وحسن التعامل مع العملاء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q4','المبادرة وتحمل المسؤولية والمساهمة في حل المشكلات وتطوير العمل.','استباق المشكلات واقتراح الحلول، وتحمّل مسؤولية النتائج دون انتظار التوجيه.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q5','تحقيق الأهداف والمؤشرات المطلوبة منه خلال فترة التقييم.','بلوغ الأرقام والمؤشرات المتفق عليها خلال فترة التقييم.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sl2','يتعامل مع العملاء باحترافية ويقدم خدمة متميزة.','استقبال العميل بلباقة، وفهم احتياجه، ومتابعته حتى إتمام البيع.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sl3','يمتلك معرفة كافية بالمنتجات ويجيد عرضها.','الإلمام بمواصفات المنتجات وأسعارها والبدائل المتاحة، وعرضها بطريقة مقنعة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sl5','ينجز مهام الفرع اليومية بكفاءة.','إنجاز المهام التشغيلية اليومية داخل الفرع في وقتها وبالجودة المطلوبة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sl6','يتقن استخدام نظام نقاط البيع دون أخطاء.','إتمام الفواتير والمرتجعات والخصومات بدقة وسرعة دون أخطاء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n1','يحافظ على الزيّ والمظهر والسلوك المهني.','الالتزام بالزيّ الرسمي وآداب التعامل داخل الفرع.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wh1','ينفذ عمليات الاستلام والصرف بدقة.','استلام البضائع وصرفها بالكميات الصحيحة وتوثيقها في النظام دون فروقات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wh2','يحافظ على ترتيب ونظافة المستودع.','ترتيب الأرفف وتنظيف المواقع وسهولة الوصول للأصناف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wh4','ينجز المهام المطلوبة في الوقت المحدد.','إنهاء أوامر التحميل والتفريغ ضمن الوقت المحدد دون تأخير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wh5','يتعاون بفعالية مع فريق العمل.','مساندة الزملاء في أوقات الذروة والتنسيق معهم لإنجاز العمل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n2','يحافظ على سلامة البضائع ويقلل التالف.','التستيف الصحيح ومنع الكسر والتلف أثناء المناولة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dr1','يلتزم بمواعيد التسليم والاستلام.','الوصول لمواقع التسليم والاستلام في الوقت المتفق عليه مع العميل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dr2','يحافظ على المركبة ويتابع جاهزيتها.','نظافة المركبة وفحصها دورياً ومتابعة الصيانة والتأمين والفحص.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dr3','يلتزم بأنظمة المرور وإجراءات السلامة.','القيادة الآمنة والالتزام بالسرعات المحددة وتجنّب المخالفات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dr4','يحافظ على سلامة البضائع أثناء النقل.','تحميل البضائع وتثبيتها بطريقة تمنع التلف أو الفقد أثناء النقل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dr5','يتعامل باحترافية مع العملاء والزملاء.','التعامل بلباقة مع العملاء عند التسليم وتمثيل الشركة بصورة لائقة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:bm3','يحقق مستوى مرتفعاً من رضا العملاء.','متابعة ملاحظات العملاء ومعالجة الشكاوى ورفع مستوى الرضا.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:bm5','يدير موارد الفرع والمخزون بكفاءة ويحقق النتائج المطلوبة.','إدارة المخزون والمصروفات والموارد البشرية للفرع بكفاءة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n3','يحقق مستهدف الربحية وضبط المصروفات.','إدارة تكاليف الفرع ضمن الموازنة المعتمدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n4','يضبط انضباط الفريق ويطبّق اللوائح.','متابعة الحضور والزيّ والسلوك المهني.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ws1','يدير عمليات المستودع بكفاءة.','تنظيم سير العمل اليومي وتوزيع المساحات ومتابعة الإنتاجية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ws3','يحافظ على دقة المخزون ويعالج الفروقات.','ضمان تطابق الرصيد الفعلي مع النظام والتحقيق في أسباب الفروقات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ws5','يتخذ القرارات المناسبة لحل المشكلات وتحسين الأداء.','معالجة المعوقات التشغيلية واتخاذ قرارات سريعة لتحسين الأداء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n5','يجهّز طلبات الفروع في الوقت المحدد.','إنهاء أوامر التحويل دون تأخير على الفروع.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n6','ينسّق مع المشتريات والمبيعات بفعالية.','التواصل حول التوريد والنواقص واحتياج الفروع.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ws2','يوزع المهام ويتابع أداء فريق العمل بفعالية.','توزيع المهام على الفريق بعدالة ومتابعة إنجازها وتقييم الأداء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ft1','الالتزام بالمواعيد اليومية وعدم التأخير على العملاء','الوصول لموقع العميل في الموعد المحدد وإشعاره مسبقاً عند أي تغيير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ft2','جودة التركيب وخلو العمل من الأخطاء أو الشكاوى','تنفيذ التركيب بإتقان من أول مرة دون إعادة زيارة أو شكوى لاحقة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ft3','التعامل الاحترافي مع العملاء أثناء الزيارة','احترام العميل وشرح العمل له والمحافظة على نظافة الموقع بعد الانتهاء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ft4','القدرة على حل المشكلات الفنية في الموقع','تشخيص العطل ومعالجته ميدانياً دون تأجيل غير مبرر.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ft5','المحافظة على أدوات العمل والمعدات','العناية بالعدد والمعدات وقطع الغيار ومنع فقدها أو تلفها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q11','حسن التعامل والتعاون مع باقي الموظفين داخل الفريق','التعاون مع الزملاء وتبادل المساندة داخل الفريق.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q12','سرعة التجاوب مع توجيهات المدير المباشر وتنفيذ المهام المطلوبة بدقة وفي الوقت المحدد','تنفيذ توجيهات المدير المباشر بدقة وضمن الوقت المطلوب.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q13','القدرة على اتخاذ القرار في المهام الروتينية دون الرجوع المتكرر للإدارة','البتّ في الأمور الروتينية باستقلالية دون الرجوع المتكرر للإدارة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q14','تقليل الاستفسارات المتكررة والاعتماد على الحلول المتاحة والإجراءات المعتمدة','الاعتماد على الإجراءات المعتمدة والحلول المتاحة قبل طلب المساعدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cs1','سرعة الرد على العملاء (واتساب / مكالمات)','الرد على رسائل الواتساب والمكالمات ضمن الوقت المعتمد دون تأخير أو إهمال.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cs2','دقة إدخال البيانات في نظام Notion','تسجيل بيانات العميل والطلب في نوشن كاملة وصحيحة دون أخطاء تستدعي إعادة العمل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cs3','متابعة مواعيد الصيانة الدورية بدون تأخير','تذكير العملاء بمواعيد الصيانة ومتابعة تنفيذها في وقتها دون نسيان.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cs4','تحويل الطلبات بشكل صحيح للفنيين أو الأقسام','توجيه الطلب للجهة الصحيحة من أول مرة وتقليل التحويلات المتكررة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cs5','أسلوب التواصل ورضا العملاء','التعامل بلباقة واحترافية واحتواء الشكاوى وتحقيق رضا العميل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n7','يدقّق مستندات الاستلام والصرف قبل الاعتماد.','مطابقة الفاتورة وأمر الشراء والكمية الفعلية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cc1','جودة وإبداع المحتوى.','جودة الفكرة والتنفيذ وقدرة المحتوى على جذب الانتباه.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cc2','الالتزام بخطة النشر.','الالتزام بجدول النشر المعتمد وعدد المنشورات المستهدف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cc3','جودة التصميم والإخراج.','جودة التصوير والمونتاج والإخراج النهائي للمحتوى.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cc4','الالتزام بالمواعيد.','تسليم المواد قبل موعد النشر بوقت كافٍ للمراجعة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cc5','تحقيق التفاعل مع الجمهور.','نمو نسب المشاهدة والتفاعل والوصول للمنشورات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cw1','جودة ودقة المحتوى المكتوب.','دقة المعلومة وسلامة الصياغة وملاءمتها للجمهور المستهدف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cw2','الالتزام بالهوية والأسلوب.','اتساق المحتوى مع نبرة العلامة التجارية وهويتها البصرية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cw3','سلامة اللغة والإملاء.','خلوّ النصوص من الأخطاء الإملائية والنحوية وعلامات الترقيم.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cw4','الالتزام بمواعيد التسليم.','تسليم المحتوى وفق الجدول المتفق عليه دون تأخير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cw5','الإبداع في طرح الأفكار.','تقديم أفكار جديدة تميّز محتوى الشركة عن المنافسين.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pu1','دقة إدخال بيانات المنتجات.','إدخال الأسماء والأسعار والأكواد والمواصفات دون أخطاء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pu2','اكتمال معلومات المنتجات.','استيفاء كل حقول المنتج من صور ووصف وتصنيف ومخزون.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pu3','سرعة تحديث المنتجات.','رفع المنتجات الجديدة وتحديث المتوفر منها في وقت قصير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pu4','الالتزام بمعايير عرض المنتجات.','اتباع دليل عرض المنتجات في الصور والوصف والتصنيف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pu5','تقليل أخطاء البيانات.','مراجعة البيانات قبل النشر وتقليل الأخطاء المتكررة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wa1','يسجل الحركات المخزنية بدقة.','إدخال حركات الإدخال والإخراج في النظام فور حدوثها وبأرقام صحيحة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wa2','يطابق أرصدة المخزون ويحد من الفروقات.','مطابقة الرصيد الدفتري بالفعلي دورياً ومعالجة أي فروقات فوراً.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wa3','يعد التقارير والسجلات في الوقت المحدد.','تسليم تقارير المخزون والجرد في مواعيدها المعتمدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wa4','يلتزم بالإجراءات والسياسات المحاسبية.','تطبيق الدورة المستندية وسياسات الصرف والاستلام المعتمدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wa5','يتعاون مع الإدارات ذات العلاقة بكفاءة.','التنسيق مع المشتريات والمبيعات والمالية لإنهاء المعاملات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q6','دقة إدارة المخزون (تحديث الكميات وعدم وجود أخطاء جرد)','تحديث الكميات في النظام أولاً بأول وخلوّ الجرد من الفروقات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q7','سرعة ودقة تجهيز الطلبات داخل المتجر','تجميع الطلب بالأصناف والكميات الصحيحة وتسليمه في وقته.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q8','مهارات البيع المباشر وزيادة متوسط قيمة الفاتورة','إقناع العميل واقتراح المنتجات المكمّلة لرفع قيمة الطلب.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q9','تنظيم المستودع وترتيب المنتجات وسهولة الوصول لها','ترتيب الأصناف في مواقعها وتسهيل الوصول إليها وقت التجهيز.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:q10','متابعة الأسعار والتأكد من تحديثها بشكل مستمر','مراجعة الأسعار دورياً والتأكد من مطابقتها للمعتمد.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pa1','دقة تنفيذ إجراءات الشراء.','إعداد طلبات الشراء ومطابقتها للمواصفات والكميات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pa3','التواصل مع الموردين.','التواصل مع الموردين لطلب العروض ومتابعة التوريد.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pa4','الالتزام بسياسات المشتريات.','الالتزام بدورة الشراء والصلاحيات والموافقات المعتمدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pa5','سرعة إنجاز الأعمال.','إنهاء المعاملات في وقت قصير دون تعطيل احتياج الأقسام.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n8','ينسّق مع المستودع حول النواقص','متابعة حدود إعادة الطلب.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:eo1','كفاءة إدارة عمليات المتجر.','انسياب العمليات من الطلب حتى التسليم دون تعطّل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:eo2','تحسين تجربة العملاء.','تحسين رحلة الشراء وتقليل خطواتها ومعالجة نقاط الشكوى.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:eo4','تطوير الأداء التشغيلي.','تطوير الإجراءات ورفع كفاءة التشغيل وتقليل الأخطاء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:eo5','التنسيق مع الإدارات.','التنسيق مع المستودع والمبيعات والتسويق والدعم التقني.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n9','يطوّر فريق المتجر ويرفع كفاءته','تدريب الفريق وتوزيع المهام.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:it1','يعالج الأعطال والبلاغات بكفاءة وسرعة.','معالجة البلاغات التقنية بسرعة وإعادة الأنظمة للعمل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:it3','يلتزم بإنهاء الأعمال في الوقت المحدد.','إغلاق تذاكر الدعم ضمن الوقت المعتمد لكل نوع بلاغ.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:it4','يتواصل بفعالية مع المستفيدين والإدارات.','شرح الحلول للمستفيدين والتنسيق مع الأقسام والموردين.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:it5','يبادر إلى اقتراح حلول لتحسين جودة الدعم الفني.','اقتراح تحسينات تقنية تقلل الأعطال وترفع جودة الخدمة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n10','يدرّب الموظفين على استخدام الأنظمة','رفع كفاءة المستخدمين وتقليل البلاغات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dm1','تحقيق أهداف التسويق الرقمي.','بلوغ مستهدفات الزيارات والتحويل والمبيعات من القنوات الرقمية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dm2','إدارة الحملات الإعلانية بكفاءة.','تخطيط الحملات وتنفيذها ومتابعة أدائها وتحسينها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dm4','إدارة الميزانية التسويقية.','توزيع الإنفاق الإعلاني بكفاءة وتحقيق عائد مناسب.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:dm5','قيادة فريق التسويق.','توجيه الفريق وتطوير مهاراته ومتابعة إنجازه.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n11','يحسّن نسبة التحويل على المتجر','رفع نسبة الزوار الذين يشترون.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wm1','كفاءة إدارة المستودع.','إدارة المساحات والعمالة والمعدات وتخطيط التشغيل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wm4','الالتزام بالسياسات والإجراءات التشغيلية.','تطبيق الدورة المستندية وإجراءات الاستلام والصرف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:wm5','تحسين كفاءة التشغيل.','تقليل وقت التجهيز والتكاليف ورفع كفاءة التخزين.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n12','ينسّق مع المشتريات والمبيعات','التنسيق حول التوريد والاحتياج.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n13','يقترح تحسينات تشغيلية مستمرة','مبادرات لرفع الكفاءة وخفض التكلفة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cf1','كفاءة إدارة الموارد المالية.','إدارة السيولة والالتزامات والتدفقات النقدية بكفاءة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cf2','دقة التقارير والتحليلات المالية.','إعداد القوائم والتقارير المالية بدقة وفي مواعيدها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cf3','الرقابة على التكاليف والمصروفات.','مراقبة التكاليف وضبط المصروفات ضمن الموازنة المعتمدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cf4','جودة اتخاذ القرارات المالية.','اتخاذ قرارات مالية مدروسة تدعم أهداف الشركة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cf5','تطوير أداء الفريق المالي.','تدريب الفريق المالي ورفع كفاءته وتوزيع المهام بعدالة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hm1','كفاءة إدارة الموارد البشرية.','إدارة التوظيف والرواتب والحضور وشؤون الموظفين بكفاءة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hm2','تطوير السياسات والإجراءات.','تحديث السياسات واللوائح بما يتوافق مع نظام العمل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hm3','تنمية أداء الموظفين.','وضع خطط التدريب والتقييم ومتابعة تطور الموظفين.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hm4','الالتزام بالأنظمة.','الالتزام بأنظمة العمل والتأمينات والجهات الحكومية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n14','يدير الرواتب والمستحقات بدقة وفي موعدها','صرف الرواتب دون أخطاء أو تأخير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vc1','دعم تحقيق الأهداف الاستراتيجية.','دعم تحقيق أهداف الشركة الاستراتيجية ومتابعة مؤشراتها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vc2','متابعة تنفيذ الخطط التشغيلية.','متابعة تنفيذ الخطط التشغيلية في جميع الإدارات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vc3','جودة اتخاذ القرارات.','اتخاذ قرارات مدروسة وسريعة في الأمور التشغيلية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vc4','قيادة فرق العمل بفعالية.','قيادة المديرين وتوجيههم ورفع كفاءتهم.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vc5','تعزيز التعاون بين الإدارات.','تحسين التنسيق بين الإدارات وإزالة معوقات العمل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:mt1','يتابع أعمال الصيانة بكفاءة.','متابعة أعمال الصيانة الوقائية والتصحيحية وجدولتها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:mt2','يستجيب للأعطال ويعالجها في الوقت المناسب.','الاستجابة للبلاغات وإصلاح الأعطال في وقت قصير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:mt3','يضمن جودة أعمال الصيانة المنفذة.','ضمان جودة الإصلاح وعدم تكرار العطل نفسه.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:mt4','يحافظ على جاهزية المعدات والأصول.','المحافظة على جاهزية المعدات والأصول وتقليل التوقف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:mt5','يخطط وينظم أعمال الصيانة بفعالية.','وضع خطة صيانة دورية وتوفير قطع الغيار مسبقاً.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sm1','تحقيق أهداف المبيعات والتسويق.','بلوغ المستهدف العام للمبيعات ونمو الحصة السوقية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sm2','إعداد وتنفيذ الخطط.','وضع الخطط البيعية والتسويقية ومتابعة تنفيذها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sm3','قيادة فرق العمل.','قيادة مديري الفروع والمشرفين ورفع كفاءتهم.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:sm4','تنمية المبيعات والعملاء.','استقطاب عملاء جدد وتنمية العملاء الحاليين.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n15','ينسّق مع المشتريات حول الأصناف','التنسيق حول الاحتياج والنواقص.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cx2','يتعامل مع الشكاوى والاستفسارات بفعالية.','استقبال الشكاوى وتصعيدها ومتابعتها حتى الحل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cx3','يحرص على تحقيق رضا العملاء.','رفع نسبة رضا العملاء وتقليل الشكاوى المتكررة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cx4','يلتزم بسرعة الاستجابة وإنجاز الطلبات.','الرد على الاستفسارات وإنجاز الطلبات ضمن الوقت المحدد.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:cx5','يبني علاقات إيجابية مع العملاء ويحافظ عليها.','بناء ثقة العملاء وتشجيعهم على التعامل المتكرر.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n16','يقلّل زمن الاستجابة للعملاء','الرد ضمن الوقت المعتمد لكل قناة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vs2','متابعة أداء الفرق.','متابعة أداء الفرق ورفع تقارير دورية عنها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vs3','تحسين نتائج المبيعات.','معالجة أسباب انخفاض المبيعات واقتراح حلول عملية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:vs5','التنسيق بين الإدارات.','الربط بين المبيعات والمستودع والمشتريات والتسويق.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n17','يدعم الفروع ميدانياً ويحل معوقاتها','زيارات ميدانية ومعالجة المشكلات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n18','ينسّق مع التسويق والمخازن','التنسيق حول الحملات والتوفر.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ep1','يحقق أهداف مبيعات قسم منتجات الكهرباء.','بلوغ المستهدف البيعي للقسم شهرياً وتحقيق نمو مقارنة بالفترة السابقة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ep2','يمتلك معرفة فنية بالمنتجات ويقدّم الاستشارة المناسبة للعملاء.','الإلمام بمواصفات الأصناف الكهربائية وبدائلها وترشيح الأنسب لحاجة العميل.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ep3','يدير مخزون القسم ويضمن توفر الأصناف المطلوبة.','متابعة النواقص والرواكد والتنسيق مع المشتريات قبل نفاد الأصناف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ep5','يتابع السوق والمنافسين ويقترح المنتجات والعروض.','رصد أسعار وعروض المنافسين واقتراح أصناف وعروض تنافسية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n19','يحقق هامش الربح المستهدف للقسم','التوازن بين حجم المبيعات وهامش الربح.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ic1','دقة متابعة أرصدة المخزون.','مراقبة أرصدة الأصناف ورصد النواقص والرواكد وحدود إعادة الطلب.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ic2','معالجة فروقات الجرد.','تحليل فروقات الجرد وتحديد أسبابها واقتراح إجراءات تصحيحية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ic3','إعداد تقارير المخزون بانتظام.','إصدار تقارير حركة المخزون ودورانه بانتظام.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ic4','الالتزام بالإجراءات المحاسبية.','تطبيق الإجراءات المحاسبية المعتمدة في تسعير وتقييم المخزون.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ic5','التنسيق مع المستودعات والإدارات.','التنسيق مع المستودعات والمشتريات لضبط الأرصدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:rv1','دقة تسجيل الإيرادات اليومية.','قيد الإيرادات اليومية في النظام بالمبالغ والتواريخ الصحيحة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:rv2','مطابقة الإيرادات مع السجلات.','مطابقة الإيرادات مع كشوف البنك وتقارير نقاط البيع.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:rv4','تطبيق السياسات المالية المعتمدة.','تطبيق السياسات المحاسبية ومعايير الاعتراف بالإيراد المعتمدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:rv5','معالجة الفروقات المالية بكفاءة.','تتبّع أسباب الفروقات وتسويتها في وقت قصير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n20','يتابع تحصيل المبيعات الآجلة','متابعة الذمم وأعمارها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ex1','دقة مراجعة واعتماد المصروفات.','التحقق من المستندات والفواتير قبل الاعتماد ومطابقتها للطلب.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ex2','الالتزام بسياسات الصرف.','الالتزام بحدود الصلاحيات والموازنات المعتمدة عند الصرف.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ex3','سرعة إنجاز طلبات الصرف.','معالجة طلبات الصرف وصرف المستحقات في الوقت المحدد.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ex4','المحافظة على السجلات المالية.','أرشفة المستندات وحفظها بطريقة تسهّل الرجوع إليها والتدقيق.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ex5','التعاون مع الإدارات ذات العلاقة.','التنسيق مع المشتريات والموردين والأقسام لإنهاء المعاملات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ts1','تنظيم عمليات النقل.','توزيع الرحلات على المركبات والسائقين بكفاءة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ts2','الالتزام بجداول التشغيل.','تنفيذ جدول التوصيل اليومي دون تأخير أو إلغاء.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ts3','متابعة السائقين والمركبات.','مراقبة أداء السائقين والتزامهم بالمسارات والمواعيد.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:ts5','معالجة المشكلات التشغيلية.','معالجة الأعطال والحوادث وتأخير الرحلات فور وقوعها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n21','ينسّق مع المستودع والمبيعات','التنسيق حول أولويات التسليم.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:gr1','سرعة إنجاز المعاملات الحكومية.','إنهاء معاملات قوى والتأمينات والبلدية في وقت قصير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:gr2','متابعة التراخيص والتجديدات.','متابعة تجديد السجلات والرخص قبل انتهائها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:gr3','الالتزام بالأنظمة واللوائح.','الالتزام بالأنظمة واللوائح وتجنّب المخالفات والغرامات.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:gr4','جودة التواصل مع الجهات الحكومية.','التواصل الفعّال مع الجهات الحكومية وممثليها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:gr5','دقة وسرية البيانات.','دقة البيانات المقدّمة وحفظ سرية وثائق الشركة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hs1','يضبط سجلات حضور الموظفين ويعالج الاستثناءات بدقة.','مراجعة سجلات الحضور والانصراف للموظفين وتصحيح الاستثناءات وتوثيقها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hs2','يتابع طلبات الإجازات والغياب وينجزها في الوقت المناسب.','دراسة طلبات الإجازات واعتمادها وتحديث أرصدتها في النظام.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hs4','يحافظ على تحديث بيانات وسجلات الموظفين.','تحديث ملفات الموظفين والعقود والوثائق أولاً بأول.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hs5','يقدم الدعم اللازم للموظفين ويستجيب لاستفساراتهم بفعالية.','الرد على استفسارات الموظفين ومساعدتهم في معاملاتهم.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n22','يدير ملفات الموظفين إلكترونياً','أرشفة منظّمة ومحدّثة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hc1','يرصد انضباط الموظفين في الفروع ويوثّق المخالفات.','متابعة التزام الموظفين بساعات العمل ورصد التأخير والغياب وتوثيقه بالأدلة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hs3','ينفذ الزيارات الميدانية وفق الخطة المعتمدة ويرفع تقاريرها في الوقت المحدد.','تنفيذ الزيارات الميدانية للفروع حسب الخطة ورفع التقارير.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hc3','يرصد الملاحظات والمخالفات بدقة.','توثيق المخالفات بالأدلة ووفق لائحة الجزاءات المعتمدة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:hc5','يتابع معالجة الملاحظات حتى إغلاقها.','متابعة الملاحظات مع الإدارات حتى معالجتها وإغلاقها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n23','يتحقق من تطبيق اللوائح في الفروع','جولات تدقيق دورية.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pe1','توفير المنتجات بالمواصفات المطلوبة.','توفير الأصناف بالمواصفات والجودة المطلوبة وفي وقتها.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pe2','التفاوض مع الموردين.','التفاوض على الأسعار وشروط الدفع والتوريد لصالح الشركة.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pe4','متابعة التوريد.','متابعة الشحنات والتأكد من مطابقتها عند الاستلام.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:pe5','بناء علاقات مع الموردين.','توسيع قاعدة الموردين وبناء علاقات طويلة الأمد.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_criteria(organization_id,code,name,description,max_score,mandatory,visible_to_employee,comment_required) values('00000000-0000-0000-0000-000000000001','legacy:n24','ينسّق مع قسم الكهرباء والمستودع','التنسيق حول الاحتياج والتوفر.',5,true,true,false) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','النموذج العام - مرحّل','المعايير العامة من ملف HTML','general',null,true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم أخصائي عمليات الموارد البشرية','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أخصائي عمليات الموارد البشرية' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم أخصائي مشتريات','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أخصائي مشتريات' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم أمين مستودع رئيسي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أمين مستودع رئيسي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم أمين مستودع فرعي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='أمين مستودع فرعي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم المدير المالي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='المدير المالي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم بائع','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم بائع خدمة ذاتية','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='بائع خدمة ذاتية' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم خدمة عملاء','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='خدمة عملاء' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم سائق','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='سائق' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم صانع محتوى','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='صانع محتوى' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم عامل مستودع رئيسي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع رئيسي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم عامل مستودع فرعي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='عامل مستودع فرعي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم فني تركيب','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='فني تركيب' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم كاتب محتوى وأخصائي SEO','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='كاتب محتوى وأخصائي SEO' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم محاسب الإيرادات','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب الإيرادات' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم محاسب المصروفات','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب المصروفات' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم محاسب مراقبة المخزون','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب مراقبة المخزون' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم محاسب مستودع فرعي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='محاسب مستودع فرعي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مدير التسويق الإلكتروني','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير التسويق الإلكتروني' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مدير المبيعات والتسويق','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير المبيعات والتسويق' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مدير الموارد البشرية','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير الموارد البشرية' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مدير عمليات المتجر الإلكتروني','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير عمليات المتجر الإلكتروني' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مدير فرع','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير فرع' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مدير قسم منتجات الكهرباء','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير قسم منتجات الكهرباء' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مدير مستودع رئيسي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مدير مستودع رئيسي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مراقب موارد بشرية','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مراقب موارد بشرية' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مشرف الدعم التقني','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف الدعم التقني' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مشرف خدمة عملاء الفروع','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف خدمة عملاء الفروع' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مشرف خدمة عملاء المتجر الإلكتروني','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف خدمة عملاء المتجر الإلكتروني' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مشرف صيانة','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف صيانة' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مشرف قسم الحركة والنقل','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف قسم الحركة والنقل' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مشرف مستودع رئيسي','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مشرف مستودع رئيسي' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مصمم جرافيك ومسؤول إضافة منتجات','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مصمم جرافيك ومسؤول إضافة منتجات' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم مندوب مشتريات منتجات الكهرباء','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='مندوب مشتريات منتجات الكهرباء' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم منسق شؤون حكومية','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='منسق شؤون حكومية' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن' limit 1),true,1) on conflict do nothing;
insert into public.evaluation_templates(organization_id,name,description,scope_type,scope_id,active,version) values('00000000-0000-0000-0000-000000000001','تقييم نائب مدير المبيعات والتسويق','نموذج مرحّل تلقائيًا من HTML','job_title',(select id from public.job_titles where organization_id='00000000-0000-0000-0000-000000000001' and name='نائب مدير المبيعات والتسويق' limit 1),true,1) on conflict do nothing;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='general' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='general' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='general' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='general' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='general' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sl2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sl3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sl5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sl6' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wh5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='عامل مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='سائق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dr1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='سائق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dr2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='سائق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dr3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='سائق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dr4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='سائق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dr5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير فرع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:bm3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير فرع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:bm5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير فرع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير فرع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n6' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع خدمة ذاتية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sl2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع خدمة ذاتية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sl3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع خدمة ذاتية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sl6' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='بائع خدمة ذاتية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n6' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ft1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ft2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ft3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ft4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ft5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,6,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q11' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,7,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q12' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,8,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q13' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,9,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='فني تركيب' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q14' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cs1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cs2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cs3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cs4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cs5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,6,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q11' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,7,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q12' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,8,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q13' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,9,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='خدمة عملاء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q14' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ws5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n7' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أمين مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n6' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='صانع محتوى' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cc1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='صانع محتوى' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cc2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='صانع محتوى' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cc3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='صانع محتوى' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cc4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='صانع محتوى' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cc5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='كاتب محتوى وأخصائي SEO' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cw1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='كاتب محتوى وأخصائي SEO' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cw2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='كاتب محتوى وأخصائي SEO' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cw3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='كاتب محتوى وأخصائي SEO' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cw4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='كاتب محتوى وأخصائي SEO' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cw5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مصمم جرافيك ومسؤول إضافة منتجات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pu1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مصمم جرافيك ومسؤول إضافة منتجات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pu2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مصمم جرافيك ومسؤول إضافة منتجات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pu3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مصمم جرافيك ومسؤول إضافة منتجات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pu4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مصمم جرافيك ومسؤول إضافة منتجات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pu5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wa1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wa2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wa3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wa4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مستودع فرعي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wa5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q6' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,6,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q7' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,7,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q8' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,8,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q9' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,9,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q10' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,10,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q11' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,11,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q12' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,12,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q13' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,13,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:q14' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي مشتريات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pa1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي مشتريات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pa3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي مشتريات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pa4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي مشتريات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pa5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي مشتريات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n8' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير عمليات المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:eo1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير عمليات المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:eo2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير عمليات المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:eo4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير عمليات المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:eo5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير عمليات المتجر الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n9' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف الدعم التقني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:it1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف الدعم التقني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:it3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف الدعم التقني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:it4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف الدعم التقني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:it5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف الدعم التقني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n10' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير التسويق الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dm1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير التسويق الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dm2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير التسويق الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dm4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير التسويق الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:dm5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير التسويق الإلكتروني' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n11' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wm1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wm4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:wm5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n12' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير مستودع رئيسي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n13' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='المدير المالي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cf1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='المدير المالي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cf2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='المدير المالي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cf3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='المدير المالي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cf4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='المدير المالي' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cf5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hm1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hm2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hm3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hm4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n14' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vc1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vc2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vc3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vc4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب المدير التنفيذي ومدير إدارة المشتريات والمخازن' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vc5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف صيانة' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:mt1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف صيانة' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:mt2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف صيانة' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:mt3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف صيانة' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:mt4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف صيانة' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:mt5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sm1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sm2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sm3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:sm4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n15' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء الفروع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cx2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء الفروع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cx3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء الفروع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cx4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء الفروع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:cx5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف خدمة عملاء الفروع' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n16' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vs2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vs3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:vs5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n17' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='نائب مدير المبيعات والتسويق' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n18' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير قسم منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ep1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير قسم منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ep2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير قسم منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ep3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير قسم منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ep5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مدير قسم منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n19' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مراقبة المخزون' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ic1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مراقبة المخزون' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ic2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مراقبة المخزون' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ic3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مراقبة المخزون' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ic4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب مراقبة المخزون' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ic5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب الإيرادات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:rv1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب الإيرادات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:rv2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب الإيرادات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:rv4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب الإيرادات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:rv5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب الإيرادات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n20' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب المصروفات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ex1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب المصروفات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ex2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب المصروفات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ex3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب المصروفات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ex4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='محاسب المصروفات' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ex5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف قسم الحركة والنقل' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ts1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف قسم الحركة والنقل' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ts2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف قسم الحركة والنقل' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ts3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف قسم الحركة والنقل' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:ts5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مشرف قسم الحركة والنقل' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n21' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='منسق شؤون حكومية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:gr1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='منسق شؤون حكومية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:gr2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='منسق شؤون حكومية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:gr3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='منسق شؤون حكومية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:gr4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='منسق شؤون حكومية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:gr5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي عمليات الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hs1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي عمليات الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hs2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي عمليات الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hs4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي عمليات الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hs5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='أخصائي عمليات الموارد البشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n22' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مراقب موارد بشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hc1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مراقب موارد بشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hs3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مراقب موارد بشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hc3' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مراقب موارد بشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:hc5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مراقب موارد بشرية' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n23' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,1,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مندوب مشتريات منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pe1' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,2,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مندوب مشتريات منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pe2' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,3,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مندوب مشتريات منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pe4' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,4,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مندوب مشتريات منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:pe5' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.template_criteria(template_id,criterion_id,weight,sort_order,mandatory,visible_to_employee,comment_required) select t.id,c.id,1,5,true,true,false from public.evaluation_templates t join public.job_titles j on j.id=t.scope_id,public.evaluation_criteria c where t.organization_id='00000000-0000-0000-0000-000000000001' and t.scope_type='job_title' and j.name='مندوب مشتريات منتجات الكهرباء' and t.version=1 and c.organization_id=t.organization_id and c.code='legacy:n24' limit 1 on conflict (template_id,criterion_id) do update set sort_order=excluded.sort_order;
insert into public.rating_scale_items(organization_id,value,label,sort_order) values('00000000-0000-0000-0000-000000000001',5,'ممتاز',1) on conflict (organization_id,value) do update set label=excluded.label,sort_order=excluded.sort_order;
insert into public.rating_scale_items(organization_id,value,label,sort_order) values('00000000-0000-0000-0000-000000000001',4,'جيد جداً',2) on conflict (organization_id,value) do update set label=excluded.label,sort_order=excluded.sort_order;
insert into public.rating_scale_items(organization_id,value,label,sort_order) values('00000000-0000-0000-0000-000000000001',3,'جيد',3) on conflict (organization_id,value) do update set label=excluded.label,sort_order=excluded.sort_order;
insert into public.rating_scale_items(organization_id,value,label,sort_order) values('00000000-0000-0000-0000-000000000001',2,'مقبول',4) on conflict (organization_id,value) do update set label=excluded.label,sort_order=excluded.sort_order;
insert into public.rating_scale_items(organization_id,value,label,sort_order) values('00000000-0000-0000-0000-000000000001',1,'ضعيف',5) on conflict (organization_id,value) do update set label=excluded.label,sort_order=excluded.sort_order;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','performance',4.5,'ممتاز','g1',1) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','performance',3.5,'جيد جداً','g2',2) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','performance',2.5,'جيد','y',3) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','performance',1.5,'مقبول','o',4) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','performance',0,'ضعيف','r',5) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','attendance',95,'ممتاز','g1',1) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','attendance',85,'جيد جداً','g2',2) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','attendance',70,'جيد','y',3) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','attendance',60,'مقبول','o',4) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','attendance',0,'ضعيف','r',5) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','target',110,'تجاوز الهدف','g1',1) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','target',100,'حقق الهدف','g2',2) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','target',85,'قريب من الهدف','y',3) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','target',70,'أقل من الهدف','o',4) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.performance_bands(organization_id,dimension,min_value,label,tone,sort_order) values('00000000-0000-0000-0000-000000000001','target',0,'أقل من الهدف','r',5) on conflict (organization_id,dimension,min_value) do update set label=excluded.label,tone=excluded.tone;
insert into public.attendance_penalty_types(organization_id,code,name,description,deduction_points,active) values('00000000-0000-0000-0000-000000000001','fp','نسيان البصمة','عدد مرات نسيان تسجيل الحضور أو الانصراف في تطبيق جسر.',3,true) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description,deduction_points=excluded.deduction_points;
insert into public.attendance_penalty_types(organization_id,code,name,description,deduction_points,active) values('00000000-0000-0000-0000-000000000001','late','التأخير بدون سبب','عدد مرات التأخر عن موعد الدوام دون تقديم عذر مسبق.',5,true) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description,deduction_points=excluded.deduction_points;
insert into public.attendance_penalty_types(organization_id,code,name,description,deduction_points,active) values('00000000-0000-0000-0000-000000000001','early','الانصراف المبكر بدون سبب','عدد مرات مغادرة العمل قبل نهاية الدوام دون إذن.',5,true) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description,deduction_points=excluded.deduction_points;
insert into public.attendance_penalty_types(organization_id,code,name,description,deduction_points,active) values('00000000-0000-0000-0000-000000000001','ord','تأخير الطلبات','عدد المهام أو الطلبات التي تأخّر إنجازها عن موعدها.',3,true) on conflict (organization_id,code) do update set name=excluded.name,description=excluded.description,deduction_points=excluded.deduction_points;
insert into public.system_settings(organization_id,key,value,description) values('00000000-0000-0000-0000-000000000001','sales_target_default','100000'::jsonb,'إعداد مرحّل من النظام القديم') on conflict (organization_id,key) do update set value=excluded.value;
insert into public.system_settings(organization_id,key,value,description) values('00000000-0000-0000-0000-000000000001','branch_target_mode','"independent"'::jsonb,'إعداد مرحّل من النظام القديم') on conflict (organization_id,key) do update set value=excluded.value;
insert into public.system_settings(organization_id,key,value,description) values('00000000-0000-0000-0000-000000000001','employee_portal_visibility','{"show_score":true,"show_criteria":true,"show_manager_notes":true}'::jsonb,'إعداد مرحّل من النظام القديم') on conflict (organization_id,key) do update set value=excluded.value;
insert into public.system_settings(organization_id,key,value,description) values('00000000-0000-0000-0000-000000000001','legacy_import','{"source":"تقييم-الموظفين-السويد(4).html","legacy_hr_evaluator":"عبدالله سالم حسن الحنيني","pins_imported":false}'::jsonb,'إعداد مرحّل من النظام القديم') on conflict (organization_id,key) do update set value=excluded.value;
commit;

-- ===== END supabase/seed.sql =====
