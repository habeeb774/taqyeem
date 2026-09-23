import { NextResponse } from 'next/server';
import { jsonError, must, requireUser } from '@/server/context';
import { uploadDesignAsset } from '@/server/design-storage';

export const runtime='nodejs';
export async function POST(req:Request){try{const c=await requireUser();const form=await req.formData();const folder=form.get('folder')==='generated'?'generated':'backgrounds';must(c,folder==='generated'?'design_templates.export':'design_templates.create');const file=form.get('file');if(!(file instanceof File))throw Object.assign(new Error('IMAGE_REQUIRED'),{status:400});const asset=await uploadDesignAsset(file,c.organizationId,folder);return NextResponse.json({ok:true,...asset},{status:201});}catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}}
