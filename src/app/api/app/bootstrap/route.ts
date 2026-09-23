import {NextRequest,NextResponse} from 'next/server';
import {requireUser,jsonError,can} from '@/server/context';
import {visibleEmployees} from '@/db/queries/security';
import {pool} from '@/db';

export async function GET(req:NextRequest){
  try{
    const c=await requireUser(),u=new URL(req.url);const limit=Number(u.searchParams.get('limit')||100),offset=Number(u.searchParams.get('offset')||0),search=u.searchParams.get('search')||'',cycleId=u.searchParams.get('cycle_id');
    const employees=await visibleEmployees(c,{limit,offset,search});const ids=employees.rows.map((e:any)=>e.id);
    const canSeeEmployees=can(c,'employees.view')||can(c,'employees.create')||can(c,'employees.update')||can(c,'evaluations.view')||can(c,'evaluations.edit');
    const canSeeEvaluations=can(c,'evaluations.view')||can(c,'evaluations.create')||can(c,'evaluations.edit')||can(c,'evaluations.submit')||can(c,'criteria.manage');
    const canSeeAttendance=can(c,'attendance.view')||can(c,'attendance.manage');
    const [titles,cycles,criteria,ratings,penalties,settings,assignments,evals,targets,attendance]=await Promise.all([
      canSeeEmployees?pool.query(`select id,name,code,active from public.job_titles where organization_id=$1::uuid and deleted_at is null order by name`,[c.organizationId]):Promise.resolve({rows:[]} as any),
      canSeeEvaluations?pool.query(`select id,name,month,year,status,starts_at,ends_at from public.evaluation_cycles where organization_id=$1::uuid order by year desc,month desc`,[c.organizationId]):Promise.resolve({rows:[]} as any),
      canSeeEvaluations?pool.query(`select id,code,name,description,max_score,mandatory,visible_to_employee,comment_required,active from public.evaluation_criteria where organization_id=$1::uuid and active=true order by code`,[c.organizationId]):Promise.resolve({rows:[]} as any),
      canSeeEvaluations?pool.query(`select id,value,label,sort_order,active from public.rating_scale_items where organization_id=$1::uuid and active=true order by sort_order`,[c.organizationId]):Promise.resolve({rows:[]} as any),
      canSeeAttendance?pool.query(`select id,code,name,description,deduction_points,active from public.attendance_penalty_types where organization_id=$1::uuid and active=true order by name`,[c.organizationId]):Promise.resolve({rows:[]} as any),
      pool.query(`select key,value from public.system_settings where organization_id=$1::uuid and key=any($2::text[])`,[c.organizationId,['sales_target_default','branch_target_mode','employee_portal_visibility']]),
      ids.length?pool.query(`select id,cycle_id,employee_id,evaluation_type,template_id,due_at from public.evaluation_assignments where evaluator_user_id=$1::uuid and employee_id=any($2::uuid[]) ${cycleId?'and cycle_id=$3::uuid':''}`,cycleId?[c.user.id,ids,cycleId]:[c.user.id,ids]):Promise.resolve({rows:[]} as any),
      ids.length?pool.query(`select id,assignment_id,cycle_id,employee_id,evaluation_type,status,weighted_score,final_score,result_label,notes,submitted_at,published_at,template_snapshot from public.evaluations where evaluator_user_id=$1::uuid and employee_id=any($2::uuid[]) ${cycleId?'and cycle_id=$3::uuid':''}`,cycleId?[c.user.id,ids,cycleId]:[c.user.id,ids]):Promise.resolve({rows:[]} as any),
      ids.length?pool.query(`select id,cycle_id,employee_id,target_amount,achieved_amount,last_edit_reason,source from public.sales_targets where employee_id=any($1::uuid[]) ${cycleId?'and cycle_id=$2::uuid':''}`,cycleId?[ids,cycleId]:[ids]):Promise.resolve({rows:[]} as any),
      ids.length?pool.query(`select id,cycle_id,employee_id,base_score,final_score,notes,status,updated_at from public.attendance_evaluations where employee_id=any($1::uuid[]) ${cycleId?'and cycle_id=$2::uuid':''}`,cycleId?[ids,cycleId]:[ids]):Promise.resolve({rows:[]} as any)
    ]);
    return NextResponse.json({ok:true,user:{id:c.user.id,name:c.user.name||c.user.email,email:c.user.email,employee_id:c.user.employeeId},roles:c.roles,permissions:c.permissions,scopes:c.scopes,
      employees:employees.rows,employee_pagination:{total:employees.total,limit:employees.limit,offset:employees.offset,has_more:employees.hasMore},job_titles:titles.rows,cycles:cycles.rows,criteria:criteria.rows,ratings:ratings.rows,penalties:penalties.rows,settings:Object.fromEntries(settings.rows.map((x:any)=>[x.key,x.value])),assignments:assignments.rows,evaluations:evals.rows,targets:targets.rows,attendance:attendance.rows});
  }catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}
}
