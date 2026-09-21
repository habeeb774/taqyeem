import {NextResponse} from 'next/server';
import {signOut} from '@/auth';
import {cookies} from 'next/headers';
import {pool} from '@/db';
export async function POST(){const c=await cookies(),token=c.get('taqyeem_session')?.value;if(token)await pool.query(`delete from public.sessions where session_token=$1`,[token]).catch(()=>{});await signOut({redirect:false});const r=NextResponse.json({ok:true});r.cookies.delete('taqyeem_session');return r;}
