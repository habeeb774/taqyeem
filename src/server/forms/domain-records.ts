type QueryClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> };

type ProjectionInput = {
  organizationId: string;
  submissionId: string;
  formType: string;
  employeeId: string | null;
  createdBy: string;
  payload: Record<string, any>;
};

function stateOf(payload: Record<string, any>) {
  return payload && typeof payload.state === 'object' && payload.state ? payload.state : payload;
}

function field(payload: Record<string, any>, key: string): string | null {
  const inputs = stateOf(payload)?.inputs || {};
  const raw = inputs[`f_${key}`] ?? inputs[key];
  if (raw === undefined || raw === null || raw === '') return null;
  return String(raw).trim() || null;
}

function numberValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Build searchable HR records from immutable issued/approved submissions. */
export async function syncFormDomainRecords(client: QueryClient, input: ProjectionInput) {
  if (!input.employeeId) return;
  const state = stateOf(input.payload);

  if (input.formType === 'handover') {
    await client.query(`delete from public.employee_assets where source_submission_id=$1::uuid`, [input.submissionId]);
    const items = Array.isArray(state?.items) ? state.items : [];
    for (let position = 0; position < items.length; position += 1) {
      const item = items[position] || {};
      const name = String(item.item || '').trim();
      if (!name) continue;
      const returnedAt = field(input.payload, 'ret_date');
      const asset = await client.query(`
        insert into public.employee_assets(
          organization_id,employee_id,source_submission_id,item_position,asset_name,quantity,
          asset_value,condition_on_delivery,notes,status,assigned_at,returned_at
        ) values($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11::date,$12::date)
        returning id`, [
        input.organizationId, input.employeeId, input.submissionId, position, name,
        numberValue(item.qty) ?? 1, numberValue(item.value), item.cond || null, item.note || null,
        returnedAt ? 'returned' : 'assigned', field(input.payload, 'recv_date') || field(input.payload, 'deliver_date'), returnedAt,
      ]);
      await client.query(`
        insert into public.employee_asset_events(
          organization_id,asset_id,event_type,event_date,condition,notes,source_submission_id,created_by
        ) values($1::uuid,$2::uuid,'assigned',$3::date,$4,$5,$6::uuid,$7::uuid)`, [
        input.organizationId, asset.rows[0].id, field(input.payload, 'recv_date') || field(input.payload, 'deliver_date'),
        item.cond || null, item.note || null, input.submissionId, input.createdBy,
      ]);
      if (returnedAt) {
        await client.query(`
          insert into public.employee_asset_events(
            organization_id,asset_id,event_type,event_date,condition,notes,source_submission_id,created_by
          ) values($1::uuid,$2::uuid,'returned',$3::date,$4,$5,$6::uuid,$7::uuid)`, [
          input.organizationId, asset.rows[0].id, returnedAt, field(input.payload, 'ret_cond'), field(input.payload, 'ret_by'), input.submissionId, input.createdBy,
        ]);
      }
    }
  }

  if (input.formType === 'violation') {
    await client.query(`
      insert into public.employee_violations(
        organization_id,employee_id,source_submission_id,violation_date,violation_type,penalty,description,manager_name
      ) values($1::uuid,$2::uuid,$3::uuid,$4::date,$5,$6,$7,$8)
      on conflict(source_submission_id) do update set
        violation_date=excluded.violation_date,violation_type=excluded.violation_type,
        penalty=excluded.penalty,description=excluded.description,manager_name=excluded.manager_name,updated_at=now()`, [
      input.organizationId, input.employeeId, input.submissionId, field(input.payload, 'vio_date'), field(input.payload, 'vio_type'),
      field(input.payload, 'penalty'), field(input.payload, 'vio_details'), field(input.payload, 'manager'),
    ]);
  }

  if (input.formType === 'cash_advance') {
    const installmentText = field(input.payload, 'inst_count');
    await client.query(`
      insert into public.employee_advances(
        organization_id,employee_id,source_submission_id,request_date,request_type,amount,
        installment_count,payment_method,reason
      ) values($1::uuid,$2::uuid,$3::uuid,$4::date,$5,$6,$7,$8,$9)
      on conflict(source_submission_id) do update set
        request_date=excluded.request_date,request_type=excluded.request_type,amount=excluded.amount,
        installment_count=excluded.installment_count,payment_method=excluded.payment_method,
        reason=excluded.reason,updated_at=now()`, [
      input.organizationId, input.employeeId, input.submissionId, field(input.payload, 'form_date'), field(input.payload, 'req_type'),
      numberValue(field(input.payload, 'amount')), numberValue(installmentText), field(input.payload, 'pay_method'), field(input.payload, 'reasons'),
    ]);
  }

  if (input.formType === 'monthly_report') {
    await client.query(`
      insert into public.employee_monthly_reports(
        organization_id,employee_id,source_submission_id,period_from,period_to,tasks,highlights,next_plan,notes
      ) values($1::uuid,$2::uuid,$3::uuid,$4::date,$5::date,$6::jsonb,$7,$8,$9)
      on conflict(source_submission_id) do update set
        period_from=excluded.period_from,period_to=excluded.period_to,tasks=excluded.tasks,
        highlights=excluded.highlights,next_plan=excluded.next_plan,notes=excluded.notes,updated_at=now()`, [
      input.organizationId, input.employeeId, input.submissionId, field(input.payload, 'period_from'), field(input.payload, 'period_to'),
      JSON.stringify(Array.isArray(state?.items) ? state.items : []), field(input.payload, 'highlights'), field(input.payload, 'next_plan'), field(input.payload, 'notes'),
    ]);
  }
}
