import { NextResponse } from 'next/server';
import { jsonError } from './context';

export function jsonOk<T extends Record<string, unknown>>(payload: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...payload }, init);
}

export function jsonFail(error: unknown) {
  const response = jsonError(error);
  return NextResponse.json(
    { ok: false, error: response.error },
    { status: response.status },
  );
}
