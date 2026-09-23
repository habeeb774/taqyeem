import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { pool } from '@/db';
import { allVisibleEmployeeIds } from '@/db/queries/security';
import { jsonError, must, requireUser } from '@/server/context';

function readFilters(req: NextRequest) {
  const url = new URL(req.url);
  const year = url.searchParams.get('year');
  const month = url.searchParams.get('month');

  return {
    year,
    month,
    format: url.searchParams.get('format') || 'json',
    yearValue: year ? Number(year) : null,
    monthValue: month ? Number(month) : null,
  };
}

function queryPerformance(
  employeeIds: string[],
  year: number | null,
  month: number | null,
) {
  return pool.query(
    `
      select
        e.employee_id,
        emp.employee_number,
        emp.full_name,
        c.year,
        c.month,
        e.final_score,
        e.result_label,
        e.status
      from public.evaluations e
      join public.employees emp on emp.id = e.employee_id
      join public.evaluation_cycles c on c.id = e.cycle_id
      where e.employee_id = any($1::uuid[])
        and ($2::int is null or c.year = $2)
        and ($3::int is null or c.month = $3)
      order by c.year desc, c.month desc, emp.full_name
    `,
    [employeeIds, year, month],
  );
}

function queryTargets(
  employeeIds: string[],
  year: number | null,
  month: number | null,
) {
  return pool.query(
    `
      select
        t.employee_id,
        emp.employee_number,
        emp.full_name,
        c.year,
        c.month,
        t.target_amount,
        t.achieved_amount,
        case
          when t.target_amount > 0
          then round(t.achieved_amount / t.target_amount * 100, 2)
          else 0
        end achievement_percentage
      from public.sales_targets t
      join public.employees emp on emp.id = t.employee_id
      join public.evaluation_cycles c on c.id = t.cycle_id
      where t.employee_id = any($1::uuid[])
        and ($2::int is null or c.year = $2)
        and ($3::int is null or c.month = $3)
      order by c.year desc, c.month desc, emp.full_name
    `,
    [employeeIds, year, month],
  );
}

function queryAttendance(
  employeeIds: string[],
  year: number | null,
  month: number | null,
) {
  return pool.query(
    `
      select
        a.employee_id,
        emp.employee_number,
        emp.full_name,
        c.year,
        c.month,
        a.base_score,
        a.final_score,
        a.status
      from public.attendance_evaluations a
      join public.employees emp on emp.id = a.employee_id
      join public.evaluation_cycles c on c.id = a.cycle_id
      where a.employee_id = any($1::uuid[])
        and ($2::int is null or c.year = $2)
        and ($3::int is null or c.month = $3)
      order by c.year desc, c.month desc, emp.full_name
    `,
    [employeeIds, year, month],
  );
}

function createWorkbook(
  performance: any[],
  targets: any[],
  attendance: any[],
  year: string | null,
  month: string | null,
) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(performance),
    'الأداء',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(targets),
    'الأهداف',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(attendance),
    'الحضور',
  );

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(buffer, {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="taqyeem-report-${
        year || 'all'
      }-${month || 'all'}.xlsx"`,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'reports.view');

    const filters = readFilters(req);
    const employeeIds = await allVisibleEmployeeIds(context);
    if (!employeeIds.length) {
      return NextResponse.json({
        ok: true,
        performance: [],
        targets: [],
        attendance: [],
      });
    }

    const [performance, targets, attendance] = await Promise.all([
      queryPerformance(employeeIds, filters.yearValue, filters.monthValue),
      queryTargets(employeeIds, filters.yearValue, filters.monthValue),
      queryAttendance(employeeIds, filters.yearValue, filters.monthValue),
    ]);

    if (filters.format === 'xlsx') {
      must(context, 'reports.export');
      return createWorkbook(
        performance.rows,
        targets.rows,
        attendance.rows,
        filters.year,
        filters.month,
      );
    }

    return NextResponse.json({
      ok: true,
      performance: performance.rows,
      targets: targets.rows,
      attendance: attendance.rows,
    });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
