-- Persist timesheet editor drafts in-database and switch expenses to month/week-of-month periods.

alter table public.timesheets
  add column if not exists draft_payload jsonb;

insert into public.billing_types (name, requires_project, sort_order, active)
values
  ('Regular Time 1', false, 1, true),
  ('Regular Time 2', false, 2, true),
  ('Regular Time 3', false, 3, true),
  ('Regular Time 4', false, 4, true),
  ('Start Holiday', false, 5, true),
  ('Vacation', false, 6, true),
  ('Earned Day Off', false, 7, true),
  ('Sick', false, 8, true),
  ('Compassionate', false, 9, true),
  ('Leave Without Pay', false, 10, true)
on conflict (name) do update
set
  requires_project = excluded.requires_project,
  sort_order = excluded.sort_order,
  active = excluded.active;

insert into public.projects (code, title, active)
values
  ('LOC-BEAUVAL', 'Beauval', true),
  ('LOC-BRABANT-LAKE', 'Brabant Lake', true),
  ('LOC-BUFFALO-NARROWS', 'Buffalo Narrows', true),
  ('LOC-COLE-BAY', 'Cole Bay', true),
  ('LOC-CUMBERLAND-HOUSE', 'Cumberland House', true),
  ('LOC-GREEN-LAKE', 'Green Lake', true),
  ('LOC-JANS-BAY', 'Jans Bay', true),
  ('LOC-LA-LOCHE', 'La Loche', true),
  ('LOC-LA-RONGE-AIR-RONGE', 'La Ronge/Air Ronge', true),
  ('LOC-PINEHOUSE', 'Pinehouse', true),
  ('LOC-SANDY-BAY', 'Sandy Bay', true),
  ('LOC-ST-GEORGES-HILL', 'St George''s Hill', true),
  ('LOC-STONY-RAPIDS', 'Stony Rapids', true),
  ('LOC-TIMBER-BAY', 'Timber Bay', true),
  ('LOC-URANIUM-CITY', 'Uranium City', true),
  ('LOC-WEYAKWIN', 'Weyakwin', true)
on conflict (code) do update
set
  title = excluded.title,
  active = excluded.active,
  updated_at = now();

drop policy if exists "timesheets_update_employee_draft" on public.timesheets;
create policy "timesheets_update_employee_draft"
on public.timesheets for update
using (
  employee_id = auth.uid()
  and status in ('draft', 'rejected', 'manager_rejected')
)
with check (
  employee_id = auth.uid()
  and status in ('draft', 'rejected', 'manager_rejected', 'submitted')
);

drop policy if exists "timesheet_rows_employee_write" on public.timesheet_rows;
create policy "timesheet_rows_employee_write"
on public.timesheet_rows for all
using (
  exists (
    select 1 from public.timesheets t
    where t.id = timesheet_id
      and t.employee_id = auth.uid()
      and t.status in ('draft', 'rejected', 'manager_rejected')
  )
)
with check (
  exists (
    select 1 from public.timesheets t
    where t.id = timesheet_id
      and t.employee_id = auth.uid()
      and t.status in ('draft', 'rejected', 'manager_rejected')
  )
);

drop policy if exists "expense_reports_update_employee_draft" on public.expense_reports;
create policy "expense_reports_update_employee_draft"
on public.expense_reports for update
using (employee_id = auth.uid() and status in ('draft', 'rejected', 'manager_rejected'))
with check (employee_id = auth.uid() and status in ('draft', 'rejected', 'manager_rejected', 'submitted'));

drop policy if exists "expense_entries_employee_write" on public.expense_entries;
create policy "expense_entries_employee_write"
on public.expense_entries for all
using (
  exists (
    select 1 from public.expense_reports r
    where r.id = report_id
      and r.employee_id = auth.uid()
      and r.status in ('draft', 'rejected', 'manager_rejected')
  )
)
with check (
  exists (
    select 1 from public.expense_reports r
    where r.id = report_id
      and r.employee_id = auth.uid()
      and r.status in ('draft', 'rejected', 'manager_rejected')
  )
);

alter table public.expense_reports
  add column if not exists month int;

update public.expense_reports
set month = extract(month from week_beginning_date)::int
where month is null;

alter table public.expense_reports
  drop constraint if exists expense_reports_month_check;

alter table public.expense_reports
  add constraint expense_reports_month_check
  check (month between 1 and 12);

alter table public.expense_reports
  alter column month set not null;

update public.expense_reports
set week_number = lpad(
  least(5, greatest(1, ceil(extract(day from week_beginning_date)::numeric / 7)))::int::text,
  2,
  '0'
)
where week_beginning_date is not null;

drop index if exists expense_reports_unique_period;
create unique index if not exists expense_reports_unique_period
  on public.expense_reports(employee_id, year, month, week_number);

alter table public.expense_reports
  drop constraint if exists expense_reports_week_number_check;

alter table public.expense_reports
  add constraint expense_reports_week_number_check
  check (week_number ~ '^(0[1-5])$');
