import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {randomBytes,createHash} from 'node:crypto';
import {hash} from 'bcryptjs';
import {pool} from '@/db';

const requestSchema=z.object({email:z.string().trim().email()});
const resetSchema=z.object({token:z.string().min(32),password:z.string().min(8).max(200)});
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');

export async function POST(req:NextRequest){
  const body=await req.json().catch(()=>null);
  try{
    if(body?.action==='reset'){
      const p=resetSchema.parse(body), d=digest(p.token);
      const r=await pool.query(`select identifier from public.verification_tokens where token=$1 and expires>now() limit 1`,[d]);
      if(!r.rows[0])return NextResponse.json({ok:false,error:'RESET_TOKEN_INVALID'},{status:400});
      const email=String(r.rows[0].identifier).replace(/^password-reset:/,'');
      const h=await hash(p.password,12);
      await pool.query(`begin`);try{await pool.query(`update public.users set password_hash=$2,updated_at=now() where lower(email)=lower($1) and active=true`,[email,h]);await pool.query(`delete from public.verification_tokens where token=$1`,[d]);await pool.query(`commit`);}catch(e){await pool.query(`rollback`);throw e;}
      return NextResponse.json({ok:true});
    }
    const p=requestSchema.parse(body), email=p.email.toLowerCase();
    const u=await pool.query(`select 1 from public.users where lower(email)=lower($1) and active=true limit 1`,[email]);
    // Always return success to avoid exposing whether an account exists.
    if(u.rows[0]){
      const raw=randomBytes(32).toString('hex'), expires=new Date(Date.now()+30*60*1000);
      await pool.query(`delete from public.verification_tokens where identifier=$1`,[`password-reset:${email}`]);
      await pool.query(`insert into public.verification_tokens(identifier,token,expires) values($1,$2,$3)`,[`password-reset:${email}`,digest(raw),expires]);
      const url=`${process.env.NEXTAUTH_URL||process.env.VERCEL_URL||''}/?reset_token=${raw}`;
      if(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM){await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],subject:'استعادة كلمة المرور',html:`<p>لإعادة تعيين كلمة المرور افتح الرابط التالي خلال 30 دقيقة:</p><p><a href="${url}">${url}</a></p>`})});}
    }
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({ok:false,error:'INVALID_REQUEST'},{status:400});}
}
