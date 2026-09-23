import { NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  const session = req.cookies.get('taqyeem_session')?.value
    || req.cookies.get('__Secure-authjs.session-token')?.value
    || req.cookies.get('authjs.session-token')?.value;
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/forms',
    '/forms.html',
    '/assessment',
    '/design-templates',
    '/design-templates/:path*',
    '/generated-designs',
    '/generated-designs/:path*',
  ],
};
