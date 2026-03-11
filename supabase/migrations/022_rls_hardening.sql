-- Harden RLS: restrict manager status transitions and audit_log inserts.

-- ── Timesheets: managers can only set manager_approved / manager_rejected ──

drop policy if exists "timesheets_update_manager_submitted" on public.timesheets;
create policy "timesheets_update_manager_submitted"
on public.timesheets for update
using (
  manager_id = auth.uid()
  and status in ('submitted', 'manager_approved')
)
with check (
  manager_id = auth.uid()
  and status in ('manager_approved', 'manager_rejected')
);

-- ── Expense reports: managers can only set manager_approved / manager_rejected ──

drop policy if exists "expense_reports_update_manager_submitted" on public.expense_reports;
create policy "expense_reports_update_manager_submitted"
on public.expense_reports for update
using (
  manager_id = auth.uid()
  and status in ('submitted', 'manager_approved')
)
with check (
  manager_id = auth.uid()
  and status in ('manager_approved', 'manager_rejected')
);

-- ── Leave requests: managers can only set manager_approved / manager_rejected ──

drop policy if exists "leave_requests_update_manager" on public.leave_requests;
create policy "leave_requests_update_manager"
on public.leave_requests for update
using (
  manager_id = auth.uid()
  and status in ('submitted', 'manager_approved')
)
with check (
  manager_id = auth.uid()
  and status in ('manager_approved', 'manager_rejected')
);

-- ── Audit log: enforce actor_user_id = auth.uid() to prevent forgery ──

drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert"
on public.audit_log for insert
with check (
  auth.uid() is not null
  and actor_user_id = auth.uid()
);
