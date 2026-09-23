-- TAQYEEM final enterprise upgrade (idempotent / existing-data safe)
-- Auth.js is backed by public.users. No auth.users / Neon Auth dependency remains.

create extension if not exists pgcrypto;

-- 1) Auth.js application identity
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  email_verified timestamptz,
  image text,
  password_hash text,
  organization_id uuid,
  employee_id uuid,
  active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.users add column if not exists name text;
alter table public.users add column if not exists email_verified timestamptz;
alter table public.users add column if not exists image text;
alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists organization_id uuid;
alter table public.users add column if not exists employee_id uuid;
alter table public.users add column if not exists active boolean not null default true;
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists updated_at timestamptz not null default now();
create unique index if not exists users_email_lower_uq on public.users(lower(email));

-- Add the organization FK only when it does not already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.users'::regclass and contype='f'
      and pg_get_constraintdef(oid) ilike '%(organization_id)%references organizations%'
  ) then
    alter table public.users add constraint users_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete restrict;
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.users'::regclass and contype='f'
      and pg_get_constraintdef(oid) ilike '%(employee_id)%references employees%'
  ) then
    alter table public.users add constraint users_employee_id_fkey
      foreign key (employee_id) references public.employees(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

create table if not exists public.accounts (
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  provider text not null,
  provider_account_id text not null,
  refresh_token text,
  access_token text,
  expires_at integer,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  primary key(provider, provider_account_id)
);
create table if not exists public.sessions (
  session_token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires timestamptz not null
);
create table if not exists public.verification_tokens (
  identifier text not null,
  token text not null,
  expires timestamptz not null,
  primary key(identifier, token)
);

-- Backfill public.users from legacy profiles where possible.
with ranked_profiles as (
  select p.*,
         row_number() over (partition by lower(p.email)
           order by p.updated_at desc nulls last,p.created_at desc nulls last,p.id) email_rank
  from public.profiles p
  where nullif(trim(p.email),'') is not null
)
insert into public.users(id,name,email,organization_id,employee_id,active,last_login_at,created_at,updated_at)
select p.id,coalesce(nullif(p.full_name,''),lower(trim(p.email))),lower(trim(p.email)),p.organization_id,p.employee_id,p.is_active,p.last_login_at,p.created_at,p.updated_at
from ranked_profiles p
where p.email_rank=1
  and not exists(select 1 from public.users u where u.id=p.id)
  and not exists(select 1 from public.users u where lower(u.email)=lower(trim(p.email)))
on conflict do nothing;

update public.users u
set name=coalesce(nullif(p.full_name,''),u.name),
    organization_id=coalesce(p.organization_id,u.organization_id),
    employee_id=coalesce(p.employee_id,u.employee_id),
    active=p.is_active,
    last_login_at=coalesce(p.last_login_at,u.last_login_at),
    updated_at=now()
from public.profiles p where u.id=p.id;

-- Existing TAQYEEM installations have name NOT NULL. Ensure any imported row complies.
update public.users set name=coalesce(nullif(name,''),email) where name is null or trim(name)='';

-- 2) Direct user scopes. Upgrade existing table instead of recreating it.
create table if not exists public.user_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope_type public.scope_type not null,
  scope_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.user_scopes add column if not exists created_by uuid;
create unique index if not exists user_scopes_nullsafe_uq
  on public.user_scopes(user_id,organization_id,scope_type,coalesce(scope_id,'00000000-0000-0000-0000-000000000000'::uuid));

insert into public.user_scopes(user_id,organization_id,scope_type,scope_id,created_by)
select ur.user_id,ur.organization_id,rs.scope_type,rs.scope_id,ur.created_by
from public.user_roles ur
join public.role_scopes rs on rs.user_role_id=ur.id
join public.users u on u.id=ur.user_id
where not exists (
  select 1 from public.user_scopes us
  where us.user_id=ur.user_id and us.organization_id=ur.organization_id
    and us.scope_type=rs.scope_type and us.scope_id is not distinct from rs.scope_id
);

-- 3) Per-user permission overrides. Older schema used allowed:boolean.
create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  organization_id uuid,
  effect text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.user_permission_overrides add column if not exists organization_id uuid;
alter table public.user_permission_overrides add column if not exists effect text;
alter table public.user_permission_overrides add column if not exists created_by uuid;

do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='user_permission_overrides' and column_name='allowed') then
    execute 'update public.user_permission_overrides set effect=coalesce(effect,case when allowed then ''allow'' else ''deny'' end)';
    -- Older TAQYEEM versions required allowed:boolean on every insert. Auth.js uses effect instead.
    execute 'alter table public.user_permission_overrides alter column allowed drop not null';
  end if;
end $$;

update public.user_permission_overrides o
set organization_id=coalesce(o.organization_id,u.organization_id,p.organization_id)
from public.users u
left join public.profiles p on p.id=u.id
where o.user_id=u.id and o.organization_id is null;
update public.user_permission_overrides set effect='allow' where effect is null;
alter table public.user_permission_overrides alter column effect set default 'allow';
alter table public.user_permission_overrides alter column effect set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid='public.user_permission_overrides'::regclass
      and conname='user_permission_overrides_effect_check'
  ) then
    alter table public.user_permission_overrides add constraint user_permission_overrides_effect_check
      check(effect in ('allow','deny'));
  end if;
exception when duplicate_object then null;
end $$;
create unique index if not exists upo_user_permission_org_uq
  on public.user_permission_overrides(user_id,permission_id,organization_id);

-- 4) Target change history.
alter table public.sales_targets add column if not exists updated_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid='public.sales_targets'::regclass and conname='sales_targets_updated_by_fkey'
  ) then
    alter table public.sales_targets add constraint sales_targets_updated_by_fkey
      foreign key(updated_by) references public.users(id) on delete set null;
  end if;
exception when duplicate_object then null;
end $$;

create table if not exists public.target_change_history (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.sales_targets(id) on delete cascade,
  old_target numeric(14,2),
  new_target numeric(14,2) not null,
  reason text not null,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create or replace function public.taqyeem_capture_target_change()
returns trigger language plpgsql as $$
begin
  if old.target_amount is distinct from new.target_amount then
    if nullif(trim(coalesce(new.last_edit_reason,'')),'') is null then
      raise exception 'target_change_reason_required';
    end if;
    insert into public.target_change_history(target_id,old_target,new_target,reason,changed_by)
    values(new.id,old.target_amount,new.target_amount,new.last_edit_reason,coalesce(new.updated_by,new.created_by));
  end if;
  return new;
end;$$;
drop trigger if exists trg_taqyeem_target_change on public.sales_targets;
create trigger trg_taqyeem_target_change after update of target_amount on public.sales_targets
for each row execute function public.taqyeem_capture_target_change();

-- 5) Performance indexes.
create index if not exists idx_employees_org_status on public.employees(organization_id,status) where deleted_at is null;
create index if not exists idx_employees_branch on public.employees(branch_id) where deleted_at is null;
create index if not exists idx_employees_department on public.employees(department_id) where deleted_at is null;
create index if not exists idx_employees_job_title on public.employees(job_title_id) where deleted_at is null;
create index if not exists idx_employees_manager on public.employees(manager_id) where deleted_at is null;
create index if not exists idx_evaluations_cycle_employee on public.evaluations(cycle_id,employee_id,status);
create index if not exists idx_eval_assignments_evaluator_cycle on public.evaluation_assignments(evaluator_user_id,cycle_id,employee_id);
create index if not exists idx_user_scopes_user_org on public.user_scopes(user_id,organization_id,scope_type,scope_id);
create index if not exists idx_user_roles_user_org on public.user_roles(user_id,organization_id);
create index if not exists idx_role_scopes_role on public.role_scopes(user_role_id,scope_type,scope_id);
create index if not exists idx_audit_org_created on public.audit_logs(organization_id,created_at desc);
create index if not exists idx_notifications_user_created on public.notifications(user_id,created_at desc);
