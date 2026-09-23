import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema/auth';

const credentials=z.object({email:z.string().email(),password:z.string().min(8).max(200)});

async function credentialUser(emailRaw:string,password:string){
  const email=emailRaw.trim().toLowerCase();
  const rows=await db.select({id:users.id,name:users.name,email:users.email,passwordHash:users.passwordHash,active:users.active}).from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1);
  const row=rows[0];
  if(!row?.active||!row.passwordHash)return null;
  if(!(await compare(password,String(row.passwordHash))))return null;
  return {id:String(row.id),name:row.name||email,email:String(row.email)};
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60*60*24*30, updateAge: 60*60*12 },
  providers: [Credentials({
    name: 'TAQYEEM Credentials',
    credentials: {email:{label:'Email',type:'email'},password:{label:'Password',type:'password'}},
    authorize: async(raw)=>{const parsed=credentials.safeParse(raw);if(!parsed.success)return null;return credentialUser(parsed.data.email,parsed.data.password);}
  })],
  callbacks: {
    async jwt({token,user}){if(user?.id)token.sub=String(user.id);return token;},
    async session({session,token}){if(session.user&&token.sub)(session.user as any).id=token.sub;return session;}
  },
  events: {
    async signIn({user}){if(user.id)await db.update(users).set({lastLoginAt:new Date(),updatedAt:new Date()}).where(eq(users.id,String(user.id))).catch(()=>{});}
  }
});
