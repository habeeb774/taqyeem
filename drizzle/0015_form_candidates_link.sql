alter table public.form_documents add column if not exists candidate_id uuid references public.candidates(id);
create index if not exists form_documents_candidate_idx on public.form_documents(organization_id,candidate_id,updated_at desc) where deleted_at is null;
create index if not exists candidates_employee_idx on public.candidates(organization_id,employee_id) where employee_id is not null;
