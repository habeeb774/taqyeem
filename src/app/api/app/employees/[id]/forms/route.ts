import { NextResponse } from 'next/server';
import { pool } from '@/db';
import { requireUser, jsonError, must, can, assertEmployeeAccess } from '@/server/context';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await requireUser(); must(c, 'forms.view');
    const { id } = await params;
    await assertEmployeeAccess(c, id);
    const [documents, assets, violations, advances, monthlyReports] = await Promise.all([
      pool.query(`
        select d.id,d.document_no,d.form_type,d.status,d.employee_snapshot,d.payload,
               d.created_at,d.updated_at,d.submitted_at,d.approved_at
        from public.form_documents d
        where d.organization_id=$1::uuid and d.employee_id=$2::uuid and d.deleted_at is null
          and ($3::boolean or d.employee_id=$2::uuid)
        order by d.updated_at desc limit 100`, [c.organizationId, id, can(c, 'forms.view_all')]),
      pool.query(`
        select a.*,s.document_number from public.employee_assets a
        join public.form_submissions s on s.id=a.source_submission_id
        where a.organization_id=$1::uuid and a.employee_id=$2::uuid
        order by a.created_at desc`, [c.organizationId, id]),
      pool.query(`
        select v.*,s.document_number from public.employee_violations v
        join public.form_submissions s on s.id=v.source_submission_id
        where v.organization_id=$1::uuid and v.employee_id=$2::uuid
        order by v.violation_date desc nulls last,v.created_at desc`, [c.organizationId, id]),
      pool.query(`
        select a.*,s.document_number from public.employee_advances a
        join public.form_submissions s on s.id=a.source_submission_id
        where a.organization_id=$1::uuid and a.employee_id=$2::uuid
        order by a.request_date desc nulls last,a.created_at desc`, [c.organizationId, id]),
      pool.query(`
        select r.*,s.document_number from public.employee_monthly_reports r
        join public.form_submissions s on s.id=r.source_submission_id
        where r.organization_id=$1::uuid and r.employee_id=$2::uuid
        order by r.period_from desc nulls last,r.created_at desc`, [c.organizationId, id]),
    ]);
    return NextResponse.json({
      ok: true,
      documents: documents.rows,
      assets: assets.rows,
      violations: violations.rows,
      advances: advances.rows,
      monthly_reports: monthlyReports.rows,
    });
  } catch (e) { const x = jsonError(e); return NextResponse.json({ ok: false, error: x.error }, { status: x.status }); }
}
