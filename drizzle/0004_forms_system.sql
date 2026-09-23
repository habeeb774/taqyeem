create table if not exists public.form_documents (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  form_type text not null, document_no text not null, employee_id uuid references public.employees(id),
  status text not null default 'draft', payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id), updated_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, document_no)
);
create index if not exists form_documents_org_type_idx on public.form_documents(organization_id, form_type);
create index if not exists form_documents_employee_idx on public.form_documents(employee_id);
insert into public.permissions(code,name_ar) values ('forms.view','عرض النماذج'),('forms.create','إنشاء وحفظ النماذج') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='super_admin' and p.code in ('forms.view','forms.create') on conflict do nothing;
