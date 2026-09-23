create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  template_key text not null,
  name text not null,
  category text not null default 'other',
  icon text,
  description text,
  definition jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key)
);
create index if not exists form_templates_org_active_idx on public.form_templates(organization_id, active);
insert into public.permissions(code,name_ar) values ('forms.manage_templates','إدارة قوالب النماذج') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='super_admin' and p.code='forms.manage_templates' on conflict do nothing;
