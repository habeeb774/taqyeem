import { NextResponse } from 'next/server';
import { can, jsonError, requireUser } from '@/server/context';
import { readDesignAsset } from '@/server/design-storage';

export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:Promise<{key:string[]}>}){try{const c=await requireUser();if(!can(c,'design_templates.view')&&!can(c,'design_templates.use')&&!can(c,'design_templates.export')&&!can(c,'generated_designs.view'))throw Object.assign(new Error('FORBIDDEN'),{status:403});const {key}=await params;const storageKey=key.map(decodeURIComponent).join('/');const prefix=`organizations/${c.organizationId}/designs/`;if(!storageKey.startsWith(prefix)||storageKey.includes('..'))throw Object.assign(new Error('FORBIDDEN'),{status:403});const object=await readDesignAsset(storageKey);if(!object.bytes)throw Object.assign(new Error('NOT_FOUND'),{status:404});return new NextResponse(Buffer.from(object.bytes),{headers:{'Content-Type':object.contentType,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});}catch(e){const x=jsonError(e);return NextResponse.json({ok:false,error:x.error},{status:x.status});}}
