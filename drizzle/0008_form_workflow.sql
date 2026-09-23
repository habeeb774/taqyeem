create table if not exists public.form_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_id uuid not null references public.form_documents(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references public.users(id),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists form_status_history_doc_idx on public.form_status_history(document_id,created_at desc);
create table if not exists public.form_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_id uuid not null references public.form_documents(id) on delete cascade,
  step_order integer not null,
  approver_user_id uuid references public.users(id),
  approver_role text,
  status text not null default 'pending',
  comment text,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(document_id,step_order)
);
create index if not exists form_approvals_user_status_idx on public.form_approvals(organization_id,approver_user_id,status);
insert into public.permissions(code,name_ar) values
 ('forms.edit','تعديل النماذج'),('forms.submit','إرسال النماذج'),('forms.approve','اعتماد النماذج'),('forms.reject','رفض النماذج'),('forms.archive','أرشفة النماذج')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where r.code='super_admin' and p.code like 'forms.%' on conflict do nothing;
