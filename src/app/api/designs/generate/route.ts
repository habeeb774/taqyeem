import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/db';
import { assertEmployeeAccess, jsonError, must, requireUser } from '@/server/context';

const generatedData=z.record(z.union([z.string().max(4000),z.number(),z.boolean(),z.null()])).superRefine((value,ctx)=>{
  if(Object.keys(value).length>200)ctx.addIssue({code:z.ZodIssueCode.custom,message:'TOO_MANY_FIELDS'});
});
const input=z.object({
  template_id:z.string().uuid(),employee_id:z.string().uuid().nullable().optional(),generated_data:generatedData,
  image_url:z.string().regex(/^\/api\/design-assets\/[a-zA-Z0-9%/_.-]+$/).max(1000),
  image_storage_key:z.string().regex(/^organizations\/[a-f0-9-]+\/designs\/generated\/[a-zA-Z0-9_.-]+$/).max(500),
  image_format:z.enum(['png','jpg','jpeg']),width:z.number().int().min(100).max(12000),height:z.number().int().min(100).max(12000),
});

export async function POST(req:Request){
  try{
    const c=await requireUser();must(c,'design_templates.use');must(c,'design_templates.export');
    const v=input.parse(await req.json());if(v.employee_id)await assertEmployeeAccess(c,v.employee_id);
    const client=await pool.connect();
    try{
      await client.query('begin');
      const t=await client.query(`select id,width,height from public.design_templates where id=$1::uuid and organization_id=$2::uuid and status='published' and deleted_at is null for update`,[v.template_id,c.organizationId]);
      if(!t.rows[0])throw Object.assign(new Error('TEMPLATE_NOT_PUBLISHED'),{status:409});
      if(Number(t.rows[0].width)!==v.width||Number(t.rows[0].height)!==v.height)throw Object.assign(new Error('IMAGE_SIZE_MISMATCH'),{status:400});
      if(!v.image_storage_key.startsWith(`organizations/${c.organizationId}/designs/generated/`))throw Object.assign(new Error('FORBIDDEN'),{status:403});
      const expected=`/api/design-assets/${v.image_storage_key.split('/').map(encodeURIComponent).join('/')}`;
      if(v.image_url!==expected)throw Object.assign(new Error('INVALID_IMAGE_REFERENCE'),{status:400});
      const r=await client.query(`insert into public.generated_designs(organization_id,template_id,generated_by,employee_id,generated_data,image_url,image_storage_key,image_format,width,height) values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6,$7,$8,$9,$10) returning *`,[c.organizationId,v.template_id,c.user.id,v.employee_id||null,JSON.stringify(v.generated_data),v.image_url,v.image_storage_key,v.image_format,v.width,v.height]);
      await client.query(`update public.design_templates set usage_count=usage_count+1 where id=$1::uuid`,[v.template_id]);
      await client.query(`insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values) values($1::uuid,$2::uuid,'generated_design.create','generated_design',$3::uuid,$4::jsonb)`,[c.organizationId,c.user.id,r.rows[0].id,JSON.stringify({template_id:v.template_id,image_format:v.image_format})]);
      await client.query('commit');return NextResponse.json({ok:true,design:r.rows[0]},{status:201});
    }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  }catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}
}
