import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { pool } from '@/db';
import { withNeonTransaction } from '@/lib/neon/admin';
import {
  assertEmployeeAccess,
  jsonError,
  must,
  requireUser,
} from '@/server/context';

const attendancePayloadSchema = z.object({
  cycle_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  notes: z.string().default(''),
  entries: z.array(
    z.object({
      penalty_type_id: z.string().uuid(),
      occurrences: z.number().int().min(0),
      note: z.string().optional(),
    }),
  ),
});

export async function GET(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'attendance.view');

    const cycleId = new URL(req.url).searchParams.get('cycle_id');
    const result = await pool.query(
      `
        select a.*
        from public.attendance_evaluations a
        join public.employees e on e.id = a.employee_id
        where e.organization_id = $1::uuid
          and ($2::uuid is null or a.cycle_id = $2::uuid)
        order by a.updated_at desc
      `,
      [context.organizationId, cycleId || null],
    );

    const attendance = [];
    for (const row of result.rows as any[]) {
      try {
        await assertEmployeeAccess(context, String(row.employee_id));
        attendance.push(row);
      } catch {
        // Keep scoped users from seeing attendance records outside their access.
      }
    }

    const attendanceIds = attendance.map((row: any) => row.id);
    const entries = attendanceIds.length
      ? (
          await pool.query(
            `
              select
                id,
                attendance_evaluation_id,
                penalty_type_id,
                occurrences,
                deduction_points_snapshot,
                note
              from public.attendance_penalty_entries
              where attendance_evaluation_id = any($1::uuid[])
            `,
            [attendanceIds],
          )
        ).rows
      : [];

    return NextResponse.json({ ok: true, attendance, entries });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await requireUser();
    must(context, 'attendance.manage');

    const payload = attendancePayloadSchema.parse(await req.json());
    await assertEmployeeAccess(context, payload.employee_id);

    let attendanceId = '';
    await withNeonTransaction(async (tx) => {
      let totalDeduction = 0;
      const preparedEntries = [];

      for (const entry of payload.entries) {
        const penaltyType = await tx.query(
          `
            select deduction_points
            from public.attendance_penalty_types
            where id = $1::uuid
              and organization_id = $2::uuid
              and active = true
          `,
          [entry.penalty_type_id, context.organizationId],
        );

        if (!penaltyType.rows[0]) continue;

        const points = Number(penaltyType.rows[0].deduction_points);
        totalDeduction += points * entry.occurrences;
        preparedEntries.push({ ...entry, points });
      }

      const finalScore = Math.max(0, 100 - totalDeduction);
      const savedAttendance = await tx.query(
        `
          insert into public.attendance_evaluations(
            cycle_id,
            employee_id,
            base_score,
            final_score,
            notes,
            status,
            evaluator_user_id
          )
          values($1::uuid, $2::uuid, 100, $3, $4, 'draft', $5::uuid)
          on conflict(cycle_id, employee_id) do update set
            final_score = excluded.final_score,
            notes = excluded.notes,
            evaluator_user_id = excluded.evaluator_user_id,
            updated_at = now()
          returning id
        `,
        [
          payload.cycle_id,
          payload.employee_id,
          finalScore,
          payload.notes,
          context.user.id,
        ],
      );

      attendanceId = String(savedAttendance.rows[0].id);

      await tx.query(
        `
          delete from public.attendance_penalty_entries
          where attendance_evaluation_id = $1::uuid
        `,
        [attendanceId],
      );

      for (const entry of preparedEntries) {
        await tx.query(
          `
            insert into public.attendance_penalty_entries(
              attendance_evaluation_id,
              penalty_type_id,
              occurrences,
              deduction_points_snapshot,
              note
            )
            values($1::uuid, $2::uuid, $3, $4, $5)
          `,
          [
            attendanceId,
            entry.penalty_type_id,
            entry.occurrences,
            entry.points,
            entry.note || null,
          ],
        );
      }

      await tx.query(
        `
          insert into public.audit_logs(
            organization_id,
            user_id,
            action,
            entity_type,
            entity_id,
            new_values
          )
          values(
            $1::uuid,
            $2::uuid,
            'attendance.save',
            'attendance_evaluation',
            $3::uuid,
            $4::jsonb
          )
        `,
        [
          context.organizationId,
          context.user.id,
          attendanceId,
          JSON.stringify({
            employee_id: payload.employee_id,
            final_score: finalScore,
          }),
        ],
      );
    });

    return NextResponse.json({ ok: true, id: attendanceId });
  } catch (error) {
    const response = jsonError(error);
    return NextResponse.json(
      { ok: false, error: response.error },
      { status: response.status },
    );
  }
}
