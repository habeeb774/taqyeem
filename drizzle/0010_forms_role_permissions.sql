-- Forms use the same roles as the evaluation system. Grant the operational
-- permissions to administrators/managers without creating a second auth system.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r cross join public.permissions p
where r.code in ('hr_admin')
  and p.code in ('forms.view','forms.create','forms.edit','forms.submit','forms.print')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='hr_admin' and p.code in ('forms.delete','forms.approve','forms.reject','forms.archive','forms.manage_templates','forms.view_all')
on conflict do nothing;
