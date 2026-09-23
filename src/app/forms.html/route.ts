import { NextResponse } from 'next/server';

/** Compatibility redirect; the HTML source is no longer publicly served. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL('/forms', request.url), 308);
}
