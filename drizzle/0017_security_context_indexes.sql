-- loadSecurityContext() runs on every authenticated request and filters
-- these two tables by foreign key columns that had no index, forcing a
-- sequential scan each time.
create index if not exists user_roles_user_org_idx on public.user_roles(user_id, organization_id);
create index if not exists role_scopes_user_role_idx on public.role_scopes(user_role_id);
