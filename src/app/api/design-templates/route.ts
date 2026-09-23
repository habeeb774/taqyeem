import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/db';
import { can, jsonError, must, requireUser } from '@/server/context';
import { slugify, templateInput } from '@/server/designs';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest){try{
  const c=await requireUser();must(c,'design_templates.view');const q=req.nextUrl.searchParams;
  const page=Math.max(1,Number(q.get('page')||1)),limit=Math.min(48,Math.max(1,Number(q.get('limit')||12))),offset=(page-1)*limit;
  const search=(q.get('q')||'').trim(),category=q.get('category')||'',status=q.get('status')||'',createdBy=q.get('created_by')||'';
  const sortMap:Record<string,string>={newest:'t.updated_at desc',oldest:'t.updated_at asc',name:'t.name asc',usage:'t.usage_count desc'};
  const order=sortMap[q.get('sort')||'newest']||sortMap.newest;
  const manage=can(c,'design_templates.edit')||can(c,'design_templates.publish')||can(c,'design_templates.create');
  const result=await pool.query(`select t.*,c.name category_name,u.name created_by_name,count(*) over()::int total_count
    from public.design_templates t left join public.design_categories c on c.id=t.category_id left join public.users u on u.id=t.created_by
    where t.organization_id=$1::uuid and t.deleted_at is null and ($2='' or t.name ilike '%'||$2||'%' or coalesce(t.description,'') ilike '%'||$2||'%')
      and ($3='' or t.category_id::text=$3) and ($4='' or t.status=$4) and ($5='' or t.created_by::text=$5) and ($6::boolean or t.status='published')
    order by ${order} limit $7 offset $8`,[c.organizationId,search,category,status,createdBy,manage,limit,offset]);
  const creators=await pool.query(`select distinct u.id,u.name from public.design_templates t join public.users u on u.id=t.created_by where t.organization_id=$1::uuid and t.deleted_at is null and ($2::boolean or t.status='published') order by u.name`,[c.organizationId,manage]);
  return NextResponse.json({ok:true,templates:result.rows,creators:creators.rows,page,limit,total:Number(result.rows[0]?.total_count||0)});
}catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}}

export async function POST(req:NextRequest){try{
  const c=await requireUser();must(c,'design_templates.create');const v=templateInput.parse(await req.json());
  if(v.category_id){const category=await pool.query(`select 1 from public.design_categories where id=$1::uuid and organization_id=$2::uuid and is_active=true`,[v.category_id,c.organizationId]);if(!category.rows[0])throw Object.assign(new Error('INVALID_CATEGORY'),{status:400});}
  const slug=(v.slug||slugify(v.name))+'-'+Date.now().toString(36);
  const r=await pool.query(`insert into public.design_templates(organization_id,name,slug,description,category_id,background_image_url,background_storage_key,thumbnail_url,thumbnail_storage_key,width,height,status,notes,created_by,updated_by)
    values($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8,$9,$10,$11,$12,$13,$14::uuid,$14::uuid) returning *`,[c.organizationId,v.name,slug,v.description||null,v.category_id||null,v.background_image_url||null,v.background_storage_key||null,v.thumbnail_url||v.background_image_url||null,v.thumbnail_storage_key||v.background_storage_key||null,v.width,v.height,v.status,v.notes||null,c.user.id]);
  await pool.query(`insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values) values($1::uuid,$2::uuid,'design_template.create','design_template',$3::uuid,$4::jsonb)`,[c.organizationId,c.user.id,r.rows[0].id,JSON.stringify({name:v.name,status:v.status})]);
  return NextResponse.json({ok:true,template:r.rows[0]},{status:201});
}catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}}
