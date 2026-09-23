import {NextRequest,NextResponse} from 'next/server';
import {requireUser,jsonError,can} from '@/server/context';
import {allVisibleEmployees,visibleEmployees} from '@/db/queries/security';
import {pool} from '@/db';

export async function GET(req:NextRequest){
  try{
    const c=await requireUser();
    if(!can(c,'forms.view')&&!can(c,'forms.create')) throw Object.assign(new Error('FORBIDDEN'),{status:403});
    const u=new URL(req.url),q=u.searchParams.get('q')||'',limit=Math.min(Number(u.searchParams.get('limit')||20),50);
    if(u.searchParams.get('lookups')==='1'){
      const visible=await allVisibleEmployees(c);
      const branchIds=[...new Set(visible.map((e:any)=>e.branch_id).filter(Boolean))];
      const departmentIds=[...new Set(visible.map((e:any)=>e.department_id).filter(Boolean))];
      const [branches,departments]=await Promise.all([
        branchIds.length?pool.query(`select id,name,code from public.branches where organization_id=$1::uuid and id=any($2::uuid[]) and active=true order by name`,[c.organizationId,branchIds]):{rows:[]},
        departmentIds.length?pool.query(`select id,name,code,branch_id from public.departments where organization_id=$1::uuid and id=any($2::uuid[]) and active=true order by name`,[c.organizationId,departmentIds]):{rows:[]},
      ]);
      return NextResponse.json({ok:true,branches:branches.rows,departments:departments.rows});
    }
    const result=await visibleEmployees(c,{limit,offset:0,search:q});
    return NextResponse.json({ok:true,employees:result.rows.map((e:any)=>({id:e.id,employee_number:e.employee_number,full_name:e.full_name,email:e.email,phone:e.phone,status:e.status,branch_id:e.branch_id,department_id:e.department_id,job_title_id:e.job_title_id,branch_name:e.branch_name||'',department_name:e.department_name||'',job_title_name:e.job_title_name||'',manager_id:e.manager_id,manager_name:e.manager_name||''}))});
  }catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}
}
