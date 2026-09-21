-- Reconcile Auth.js users with the enterprise organization model.
-- This is intentionally additive and safe for databases where 0001 was marked
-- applied before the users columns were fully introduced.
alter table public.users add column if not exists organization_id uuid;
alter table public.users add column if not exists employee_id uuid;
alter table public.users add column if not exists active boolean not null default true;
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.organizations') is not null and not exists (
    select 1 from pg_constraint where conrelid='public.users'::regclass and conname='users_organization_id_fkey'
  ) then
    alter table public.users add constraint users_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete restrict;
  end if;
  if to_regclass('public.employees') is not null and not exists (
    select 1 from pg_constraint where conrelid='public.users'::regclass and conname='users_employee_id_fkey'
  ) then
    alter table public.users add constraint users_employee_id_fkey
      foreign key (employee_id) references public.employees(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

create unique index if not exists users_email_lower_uq on public.users(lower(email));
create index if not exists users_org_active_idx on public.users(organization_id,active);

-- Profiles are retained for compatibility with legacy data. Where both rows
-- exist, keep the Auth.js identity linked to the same organization/employee.
update public.users u
set organization_id=coalesce(u.organization_id,p.organization_id),
    employee_id=coalesce(u.employee_id,p.employee_id),
    active=coalesce(u.active,p.is_active),
    name=coalesce(nullif(u.name,''),nullif(p.full_name,''),u.email),
    updated_at=now()
from public.profiles p
where p.id=u.id;
