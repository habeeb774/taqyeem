import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/db';
import { jsonError, must, requireUser } from '@/server/context';
import { slugify } from '@/server/designs';

const input=z.object({name:z.string().trim().min(1).max(120).refine(v=>!/[<>]/.test(v)),description:z.string().trim().max(500).nullable().optional()});
export async function GET(){try{const c=await requireUser();must(c,'design_templates.view');const r=await pool.query(`select id,name,slug,description,is_active from public.design_categories where organization_id=$1::uuid and is_active=true order by name`,[c.organizationId]);return NextResponse.json({ok:true,categories:r.rows});}catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}}
export async function POST(req:Request){try{const c=await requireUser();must(c,'design_templates.manage_categories');const v=input.parse(await req.json());const r=await pool.query(`insert into public.design_categories(organization_id,name,slug,description) values($1::uuid,$2,$3,$4) returning *`,[c.organizationId,v.name,`${slugify(v.name)}-${Date.now().toString(36)}`,v.description||null]);return NextResponse.json({ok:true,category:r.rows[0]},{status:201});}catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}}
