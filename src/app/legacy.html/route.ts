import { NextResponse } from 'next/server';

/** Old bookmarked URL: preserve the authenticated session and use the protected route. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL('/assessment', request.url), 308);
}
