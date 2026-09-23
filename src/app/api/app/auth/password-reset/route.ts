import { createHash, randomBytes } from 'node:crypto';

import { hash } from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';

const requestSchema = z.object({
  email: z.string().trim().email(),
});

const resetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8).max(200),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function checkLimit(key: string, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  current.count += 1;
  return current.count > limit;
}

function clientIp(req: NextRequest) {
  return (
    (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '')
      .split(',')[0]
      .trim() || 'unknown'
  );
}

function appOrigin(req: NextRequest) {
  const configured = process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/$/, '');

  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const host = forwardedHost || req.headers.get('host') || new URL(req.url).host;

  return `${forwardedProto}://${host}`;
}

async function resetPassword(token: string, password: string) {
  const tokenDigest = digest(token);
  const tokenResult = await pool.query(
    `
      select identifier
      from public.verification_tokens
      where token = $1
        and expires > now()
      limit 1
    `,
    [tokenDigest],
  );

  if (!tokenResult.rows[0]) {
    return NextResponse.json(
      { ok: false, error: 'RESET_TOKEN_INVALID' },
      { status: 400 },
    );
  }

  const email = String(tokenResult.rows[0].identifier).replace(
    /^password-reset:/,
    '',
  );
  const passwordHash = await hash(password, 12);

  await pool.query('begin');
  try {
    await pool.query(
      `
        update public.users
        set password_hash = $2,
            updated_at = now()
        where lower(email) = lower($1)
          and active = true
      `,
      [email, passwordHash],
    );
    await pool.query('delete from public.verification_tokens where token = $1', [
      tokenDigest,
    ]);
    await pool.query('commit');
  } catch (error) {
    await pool.query('rollback');
    throw error;
  }

  return NextResponse.json({ ok: true });
}

async function sendResetEmail(req: NextRequest, email: string) {
  const account = await pool.query(
    `
      select 1
      from public.users
      where lower(email) = lower($1)
        and active = true
      limit 1
    `,
    [email],
  );

  // Always return success to avoid exposing whether an account exists.
  if (!account.rows[0]) return;

  const rawToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 60 * 1000);
  const identifier = `password-reset:${email}`;

  await pool.query('delete from public.verification_tokens where identifier = $1', [
    identifier,
  ]);
  await pool.query(
    `
      insert into public.verification_tokens(identifier, token, expires)
      values($1, $2, $3)
    `,
    [identifier, digest(rawToken), expires],
  );

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;

  const url = `${appOrigin(req)}/?reset_token=${rawToken}`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'استعادة كلمة المرور',
      html: `
        <p>لإعادة تعيين كلمة المرور افتح الرابط التالي خلال 30 دقيقة:</p>
        <p><a href="${url}">${url}</a></p>
      `,
    }),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  try {
    const ip = clientIp(req);

    if (body?.action === 'reset') {
      if (checkLimit(`password-reset-token:${ip}`, 10)) {
        return NextResponse.json(
          { ok: false, error: 'RATE_LIMITED' },
          { status: 429 },
        );
      }

      const payload = resetSchema.parse(body);
      return resetPassword(payload.token, payload.password);
    }

    const payload = requestSchema.parse(body);
    const email = payload.email.toLowerCase();
    const rateLimitKey = `password-reset:${ip}:${digest(email)}`;

    if (checkLimit(rateLimitKey)) {
      return NextResponse.json(
        { ok: false, error: 'RATE_LIMITED' },
        { status: 429 },
      );
    }

    await sendResetEmail(req, email);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'INVALID_REQUEST' },
      { status: 400 },
    );
  }
}
