alter table public.form_documents add column if not exists employee_snapshot jsonb;
alter table public.form_documents add column if not exists submitted_at timestamptz;
alter table public.form_documents add column if not exists approved_at timestamptz;
create index if not exists form_documents_status_idx on public.form_documents(organization_id,status,updated_at desc);
