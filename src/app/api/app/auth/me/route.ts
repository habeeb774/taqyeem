import {NextResponse} from 'next/server';
import {requireUser,jsonError} from '@/server/context';
export async function GET(){try{const c=await requireUser();return NextResponse.json({ok:true,user:{id:c.user.id,name:c.user.name,email:c.user.email,employee_id:c.user.employeeId},roles:c.roles,permissions:c.permissions,scopes:c.scopes},{headers:{'Cache-Control':'no-store'}});}catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status,headers:{'Cache-Control':'no-store'}});}}
