create table if not exists public.form_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.form_templates(id) on delete cascade,
  title text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, sort_order)
);

create table if not exists public.form_template_fields (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.form_template_sections(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in (
    'text','number','date','select','textarea','employee_picker','department_picker',
    'branch_picker','table','signature','employee_name','employee_number',
    'employee_department','employee_branch','employee_job_title','employee_manager',
    'employee_phone','employee_email'
  )),
  employee_binding text,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(section_id, field_key)
);
create index if not exists form_template_fields_section_order_idx
  on public.form_template_fields(section_id, sort_order);

create table if not exists public.form_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  template_id uuid not null references public.form_templates(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, name)
);

create table if not exists public.form_approval_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.form_workflows(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  approver_type text not null check (approver_type in (
    'employee','direct_manager','department_manager','branch_manager','role','user'
  )),
  approver_role_id uuid references public.roles(id),
  approver_user_id uuid references public.users(id),
  title text,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique(workflow_id, step_order),
  check (
    (approver_type='role' and approver_role_id is not null) or
    (approver_type='user' and approver_user_id is not null) or
    (approver_type not in ('role','user') and approver_role_id is null and approver_user_id is null)
  )
);

insert into public.permissions(code,name_ar) values
 ('forms.cancel','إلغاء النماذج'),
 ('forms.print','طباعة النماذج'),
 ('forms.view_all','عرض جميع النماذج'),
 ('forms.manage_signatures','إدارة التوقيعات'),
 ('forms.manage_workflows','إدارة مسارات الموافقات'),
 ('forms.manage_document_numbers','إدارة أرقام المستندات')
on conflict(code) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='super_admin' and p.code like 'forms.%'
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='hr_admin' and p.code in ('forms.cancel','forms.print','forms.view_all','forms.manage_signatures')
on conflict do nothing;
