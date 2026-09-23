import { pool } from '@/db';

export type Scope = { type: 'organization'|'branch'|'department'|'assigned_employees'; id: string|null };
export type SecurityContext = {
  user: { id:string; email:string; name:string|null; employeeId:string|null };
  organizationId:string;
  roles:{user_role_id:string;role_id:string;code:string;name:string;scopes:Scope[]}[];
  permissions:string[];
  scopes:Scope[];
};

export async function loadSecurityContext(userId:string):Promise<SecurityContext>{
  const ur=await pool.query(`
    select u.id,u.email,u.name,u.employee_id,u.organization_id,u.active,
           p.full_name,p.is_active
    from public.users u
    left join public.profiles p on p.id=u.id
    where u.id=$1::uuid limit 1`,[userId]);
  const u=ur.rows[0] as any;
  if(!u?.active||u?.is_active===false||!u.organization_id)throw Object.assign(new Error('PROFILE_NOT_READY'),{status:403});
  const rr=await pool.query(`
    select ur.id user_role_id,r.id role_id,r.code,r.name_ar,
           coalesce(json_agg(json_build_object('type',rs.scope_type,'id',rs.scope_id)) filter(where rs.id is not null),'[]') scopes
    from public.user_roles ur join public.roles r on r.id=ur.role_id and r.active=true
    left join public.role_scopes rs on rs.user_role_id=ur.id
    where ur.user_id=$1::uuid and ur.organization_id=$2::uuid
    group by ur.id,r.id,r.code,r.name_ar`,[userId,u.organization_id]);
  const roles=rr.rows.map((r:any)=>({user_role_id:String(r.user_role_id),role_id:String(r.role_id),code:String(r.code),name:String(r.name_ar),scopes:(r.scopes||[]).map((s:any)=>({type:s.type,id:s.id?String(s.id):null}))}));
  const roleIds=roles.map(r=>r.role_id);
  const base=roleIds.length?await pool.query(`select distinct p.code from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=any($1::uuid[])`,[roleIds]):{rows:[]} as any;
  const overrides=await pool.query(`select p.code,o.effect from public.user_permission_overrides o join public.permissions p on p.id=o.permission_id where o.user_id=$1::uuid and (o.organization_id=$2::uuid or o.organization_id is null)`,[userId,u.organization_id]);
  const set=new Set<string>(base.rows.map((x:any)=>String(x.code)));
  for(const o of overrides.rows as any[]){if(o.effect==='allow')set.add(String(o.code));else set.delete(String(o.code));}
  const directScopes=await pool.query(`select scope_type,scope_id from public.user_scopes where user_id=$1::uuid and organization_id=$2::uuid`,[userId,u.organization_id]);
  const rawScopes=[...roles.flatMap(r=>r.scopes),...directScopes.rows.map((s:any)=>({type:String(s.scope_type),id:s.scope_id?String(s.scope_id):null}))] as Scope[];
  const seen=new Set<string>();
  const scopes=rawScopes.filter((scope)=>{const key=`${scope.type}:${scope.id||''}`;if(seen.has(key))return false;seen.add(key);return true;});
  return {user:{id:String(u.id),email:String(u.email),name:u.full_name||u.name||null,employeeId:u.employee_id?String(u.employee_id):null},organizationId:String(u.organization_id),roles,permissions:[...set],scopes};
}

export function can(c:SecurityContext,code:string){return c.permissions.includes(code);}
export function must(c:SecurityContext,code:string){if(!can(c,code))throw Object.assign(new Error('FORBIDDEN'),{status:403});}

function scopeParts(c:SecurityContext){
  return {
    org:c.scopes.some(s=>s.type==='organization'),
    branches:c.scopes.filter(s=>s.type==='branch'&&s.id).map(s=>s.id!),
    departments:c.scopes.filter(s=>s.type==='department'&&s.id).map(s=>s.id!),
    assigned:c.scopes.some(s=>s.type==='assigned_employees')
  };
}

export async function canAccessEmployee(c:SecurityContext,employeeId:string){
  const s=scopeParts(c); if(s.org)return true;
  const r=await pool.query(`select exists(
    select 1 from public.employees e
    where e.id=$1::uuid and e.organization_id=$2::uuid and e.deleted_at is null and (
      (cardinality($3::uuid[])>0 and e.branch_id=any($3::uuid[])) or
      (cardinality($4::uuid[])>0 and e.department_id=any($4::uuid[])) or
      ($5::boolean and exists(select 1 from public.evaluation_assignments a where a.employee_id=e.id and a.evaluator_user_id=$6::uuid)) or
      ($7::uuid is not null and (e.id=$7::uuid or e.manager_id=$7::uuid or e.supervisor_id=$7::uuid))
    )) ok`,[employeeId,c.organizationId,s.branches,s.departments,s.assigned,c.user.id,c.user.employeeId]);
  return Boolean((r.rows[0] as any)?.ok);
}

export async function assertEmployeeAccess(c:SecurityContext,employeeId:string){if(!(await canAccessEmployee(c,employeeId)))throw Object.assign(new Error('FORBIDDEN'),{status:403});}

export async function visibleEmployees(c:SecurityContext,{limit=100,offset=0,search=''}:{limit?:number;offset?:number;search?:string}={}){
  const s=scopeParts(c),lim=Math.max(1,Math.min(200,limit)),off=Math.max(0,offset),term=search.trim();
  const q=await pool.query(`
    select e.id,e.employee_number,e.full_name,e.email,e.phone,e.status,e.job_title_id,e.manager_id,e.supervisor_id,e.branch_id,e.department_id,e.section_id,j.name job_title_name,b.name branch_name,d.name department_name,m.full_name manager_name,
           count(*) over()::int total_count
    from public.employees e left join public.job_titles j on j.id=e.job_title_id left join public.branches b on b.id=e.branch_id left join public.departments d on d.id=e.department_id left join public.employees m on m.id=e.manager_id
    where e.organization_id=$1::uuid and e.deleted_at is null
      and ($2::boolean or
        (cardinality($3::uuid[])>0 and e.branch_id=any($3::uuid[])) or
        (cardinality($4::uuid[])>0 and e.department_id=any($4::uuid[])) or
        ($5::boolean and exists(select 1 from public.evaluation_assignments a where a.employee_id=e.id and a.evaluator_user_id=$6::uuid)) or
        ($7::uuid is not null and (e.id=$7::uuid or e.manager_id=$7::uuid or e.supervisor_id=$7::uuid)))
      and ($8='' or e.full_name ilike '%'||$8||'%' or coalesce(e.employee_number,'') ilike '%'||$8||'%' or coalesce(j.name,'') ilike '%'||$8||'%')
    order by e.full_name limit $9 offset $10`,[c.organizationId,s.org,s.branches,s.departments,s.assigned,c.user.id,c.user.employeeId,term,lim,off]);
  const total=Number((q.rows[0] as any)?.total_count||0);
  return {rows:q.rows.map((x:any)=>({...x,job_titles:x.job_title_name?{name:x.job_title_name}:null,total_count:undefined})),total,limit:lim,offset:off,hasMore:off+q.rows.length<total};
}

/**
 * Resolve every employee visible to the current server-side security context.
 * Pagination happens inside the server so reports and batch operations never
 * depend on the browser having loaded the full employee directory.
 */
export async function allVisibleEmployees(c: SecurityContext, search = '') {
  const rows: any[] = [];
  let offset = 0;
  for (;;) {
    const page = await visibleEmployees(c, { limit: 200, offset, search });
    rows.push(...page.rows);
    if (!page.hasMore) return rows;
    offset += page.rows.length;
    if (!page.rows.length) return rows;
  }
}

export async function allVisibleEmployeeIds(c: SecurityContext) {
  return (await allVisibleEmployees(c)).map((row: any) => String(row.id));
}
