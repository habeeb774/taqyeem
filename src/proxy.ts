import { NextRequest, NextResponse } from 'next/server';
import { isAllowedPublicOrigin } from '@/server/cors';

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const publicCrossOriginRoutes = new Set(['/api/app/applications']);

function withSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  return response;
}

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const isPublicCrossOriginRoute = publicCrossOriginRoutes.has(req.nextUrl.pathname)
    && isAllowedPublicOrigin(req.headers.get('origin'));
  if (
    req.nextUrl.pathname.startsWith('/api/')
    && mutatingMethods.has(req.method)
    && !sameOrigin(req)
    && !isPublicCrossOriginRoute
  ) {
    return withSecurityHeaders(NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 }));
  }

  const session = req.cookies.get('taqyeem_session')?.value
    || req.cookies.get('__Secure-authjs.session-token')?.value
    || req.cookies.get('authjs.session-token')?.value;
  if (!session && !req.nextUrl.pathname.startsWith('/api/')) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/login', req.url)));
  }
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/api/:path*',
    '/forms',
    '/forms.html',
    '/assessment',
    '/design-templates',
    '/design-templates/:path*',
    '/generated-designs',
    '/generated-designs/:path*',
  ],
};
