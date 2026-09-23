-- Prevent duplicate evaluator assignments for the same employee/cycle/type.
-- Abort with a useful error instead of silently deleting historical rows.
do $$
begin
  if exists (
    select 1
    from public.evaluation_assignments
    group by cycle_id, employee_id, evaluator_user_id, evaluation_type
    having count(*) > 1
    limit 1
  ) then
    raise exception 'duplicate_evaluation_assignments_exist';
  end if;
end $$;

create unique index if not exists evaluation_assignments_cycle_employee_evaluator_type_uq
  on public.evaluation_assignments(cycle_id, employee_id, evaluator_user_id, evaluation_type);
