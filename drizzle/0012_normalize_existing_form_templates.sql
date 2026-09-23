-- Materialize the legacy-compatible JSON definitions into the relational form builder.
-- The JSON definition remains the print/render snapshot; these rows are the editable source.
insert into public.form_template_sections(template_id,title,description,sort_order,active)
select
  t.id,
  coalesce(nullif(s.value->>'title',''), 'قسم ' || s.ordinality),
  nullif(s.value->>'description',''),
  s.ordinality::integer - 1,
  true
from public.form_templates t
cross join lateral jsonb_array_elements(coalesce(t.definition->'sections','[]'::jsonb))
  with ordinality as s(value, ordinality)
where t.active = true
on conflict(template_id,sort_order) do update set
  title=excluded.title,
  description=excluded.description,
  active=true,
  updated_at=now();

insert into public.form_template_fields(
  section_id,field_key,label,field_type,employee_binding,required,options,settings,sort_order,active
)
select
  section_row.id,
  coalesce(nullif(f.value->>'id',''), 'field_' || f.ordinality),
  coalesce(nullif(f.value->>'label',''), 'حقل ' || f.ordinality),
  case
    when f.value->>'type' in ('text','number','date','select','textarea','employee_picker','department_picker','branch_picker','table','signature')
      then f.value->>'type'
    else 'text'
  end,
  case f.value->>'id'
    when 'emp_name' then 'employee.full_name'
    when 'emp_no' then 'employee.employee_number'
    when 'dept' then 'employee.department_name'
    when 'branch' then 'employee.branch_name'
    when 'title' then 'employee.job_title_name'
    when 'job_title' then 'employee.job_title_name'
    when 'manager' then 'employee.manager_name'
    when 'emp_phone' then 'employee.phone'
    when 'emp_email' then 'employee.email'
    when 'emp_natid' then 'employee.national_id'
    else null
  end,
  coalesce((f.value->>'req')::boolean,false),
  case when jsonb_typeof(f.value->'opts')='array' then f.value->'opts' else '[]'::jsonb end,
  f.value - 'id' - 'label' - 'type' - 'req' - 'opts',
  f.ordinality::integer - 1,
  true
from public.form_templates t
cross join lateral jsonb_array_elements(coalesce(t.definition->'sections','[]'::jsonb))
  with ordinality as s(value, ordinality)
join public.form_template_sections section_row
  on section_row.template_id=t.id and section_row.sort_order=s.ordinality::integer-1
cross join lateral jsonb_array_elements(coalesce(s.value->'fields','[]'::jsonb))
  with ordinality as f(value, ordinality)
where t.active = true
on conflict(section_id,field_key) do update set
  label=excluded.label,
  field_type=excluded.field_type,
  employee_binding=excluded.employee_binding,
  required=excluded.required,
  options=excluded.options,
  settings=excluded.settings,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

alter table public.form_documents add column if not exists deleted_at timestamptz;
alter table public.form_submissions add column if not exists deleted_at timestamptz;
create index if not exists form_documents_archive_search_idx
  on public.form_documents(organization_id,status,updated_at desc) where deleted_at is null;
create index if not exists form_templates_active_idx
  on public.form_templates(organization_id,active,created_at);

