import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/db';
import { assertEmployeeAccess, can, jsonError, must, requireUser } from '@/server/context';

const inputSchema = z.object({ document_id: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const context = await requireUser();
    must(context, 'forms.print');
    const input = inputSchema.parse(await request.json());
    const document = await pool.query(
      `select id,employee_id,document_no,status from public.form_documents
       where id=$1::uuid and organization_id=$2::uuid and deleted_at is null`,
      [input.document_id, context.organizationId],
    );
    if (!document.rows[0]) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    if (document.rows[0].employee_id && !can(context, 'forms.view_all')) {
      await assertEmployeeAccess(context, String(document.rows[0].employee_id));
    }
    await pool.query(
      `insert into public.audit_logs(organization_id,user_id,action,entity_type,entity_id,new_values)
       values($1::uuid,$2::uuid,'form.print','form_document',$3::uuid,$4::jsonb)`,
      [context.organizationId, context.user.id, document.rows[0].id, JSON.stringify({ document_no: document.rows[0].document_no, status: document.rows[0].status })],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = jsonError(error);
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }
}
