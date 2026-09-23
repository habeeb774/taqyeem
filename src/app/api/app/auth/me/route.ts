import { NextResponse } from 'next/server';

import { jsonError, requireUser } from '@/server/context';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const context = await requireUser();

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: context.user.id,
          name: context.user.name,
          email: context.user.email,
          employee_id: context.user.employeeId,
        },
        roles: context.roles,
        permissions: context.permissions,
        scopes: context.scopes,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    const response = jsonError(error);

    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status, headers: noStoreHeaders },
    );
  }
}
