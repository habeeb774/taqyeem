create table if not exists public.document_sequences (
  organization_id uuid not null references public.organizations(id),
  sequence_key text not null,
  prefix text not null,
  next_value bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (organization_id, sequence_key)
);
