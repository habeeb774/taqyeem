import {NextResponse} from 'next/server';
import {pool} from '@/db';
export const dynamic='force-dynamic';
export async function GET(){try{const r=await pool.query(`select count(*)::int count from public.users where active=true and organization_id is not null and password_hash is not null`);return NextResponse.json({ok:true,setup_required:Number((r.rows[0] as any)?.count||0)===0},{headers:{'Cache-Control':'no-store'}});}catch(e:any){return NextResponse.json({ok:false,error:String(e?.message||'STATUS_FAILED')},{status:500});}}
