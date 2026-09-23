import { NextRequest, NextResponse } from 'next/server';
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

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cell(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }

  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function worksheet(name: string, rows: any[]) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const header = `<Row>${columns.map(cell).join('')}</Row>`;
  const body = rows
    .map((row) => `<Row>${columns.map((column) => cell(row[column])).join('')}</Row>`)
    .join('');

  return `<Worksheet ss:Name="${xmlEscape(name)}"><Table>${header}${body}</Table></Worksheet>`;
}

function createWorkbook(
  performance: any[],
  targets: any[],
  attendance: any[],
  year: string | null,
  month: string | null,
) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 ${worksheet('الأداء', performance)}
 ${worksheet('الأهداف', targets)}
 ${worksheet('الحضور', attendance)}
</Workbook>`;

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/vnd.ms-excel; charset=utf-8',
      'content-disposition': `attachment; filename="taqyeem-report-${
        year || 'all'
      }-${month || 'all'}.xls"`,
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
