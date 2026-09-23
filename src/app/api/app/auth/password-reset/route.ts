import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {randomBytes,createHash} from 'node:crypto';
import {hash} from 'bcryptjs';
import {pool} from '@/db';

const requestSchema=z.object({email:z.string().trim().email()});
const resetSchema=z.object({token:z.string().min(32),password:z.string().min(8).max(200)});
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const attempts = new Map<string, { count: number; resetAt: number }>();

function checkLimit(key:string, limit=5, windowMs=15*60*1000){
  const now=Date.now(), current=attempts.get(key);
  if(!current||current.resetAt<=now){attempts.set(key,{count:1,resetAt:now+windowMs});return false;}
  current.count+=1;
  return current.count>limit;
}

function appOrigin(req:NextRequest){
  const configured=process.env.NEXTAUTH_URL;
  if(configured)return configured.replace(/\/$/,'');
  const forwardedHost=req.headers.get('x-forwarded-host');
  const forwardedProto=req.headers.get('x-forwarded-proto')||'https';
  const host=forwardedHost||req.headers.get('host')||new URL(req.url).host;
  return `${forwardedProto}://${host}`;
}

export async function POST(req:NextRequest){
  const body=await req.json().catch(()=>null);
  try{
    const ip=(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'').split(',')[0].trim()||'unknown';
    if(body?.action==='reset'){
      if(checkLimit(`password-reset-token:${ip}`,10))return NextResponse.json({ok:false,error:'RATE_LIMITED'},{status:429});
      const p=resetSchema.parse(body), d=digest(p.token);
      const r=await pool.query(`select identifier from public.verification_tokens where token=$1 and expires>now() limit 1`,[d]);
      if(!r.rows[0])return NextResponse.json({ok:false,error:'RESET_TOKEN_INVALID'},{status:400});
      const email=String(r.rows[0].identifier).replace(/^password-reset:/,'');
      const h=await hash(p.password,12);
      await pool.query(`begin`);try{await pool.query(`update public.users set password_hash=$2,updated_at=now() where lower(email)=lower($1) and active=true`,[email,h]);await pool.query(`delete from public.verification_tokens where token=$1`,[d]);await pool.query(`commit`);}catch(e){await pool.query(`rollback`);throw e;}
      return NextResponse.json({ok:true});
    }
    const p=requestSchema.parse(body), email=p.email.toLowerCase();
    if(checkLimit(`password-reset:${ip}:${digest(email)}`))return NextResponse.json({ok:false,error:'RATE_LIMITED'},{status:429});
    const u=await pool.query(`select 1 from public.users where lower(email)=lower($1) and active=true limit 1`,[email]);
    // Always return success to avoid exposing whether an account exists.
    if(u.rows[0]){
      const raw=randomBytes(32).toString('hex'), expires=new Date(Date.now()+30*60*1000);
      await pool.query(`delete from public.verification_tokens where identifier=$1`,[`password-reset:${email}`]);
      await pool.query(`insert into public.verification_tokens(identifier,token,expires) values($1,$2,$3)`,[`password-reset:${email}`,digest(raw),expires]);
      const url=`${appOrigin(req)}/?reset_token=${raw}`;
      if(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM){await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],subject:'استعادة كلمة المرور',html:`<p>لإعادة تعيين كلمة المرور افتح الرابط التالي خلال 30 دقيقة:</p><p><a href="${url}">${url}</a></p>`})});}
    }
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({ok:false,error:'INVALID_REQUEST'},{status:400});}
}
