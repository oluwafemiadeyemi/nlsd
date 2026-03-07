-- 014_leave_balances.sql
-- Leave balance tracking table: tracks annual entitlements and used hours per leave type.

CREATE TABLE IF NOT EXISTS public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  leave_type text NOT NULL,
  entitlement_hours numeric(8,2) NOT NULL DEFAULT 0,
  used_hours numeric(8,2) NOT NULL DEFAULT 0,

  CONSTRAINT leave_balances_unique UNIQUE(employee_id, year, leave_type),
  CONSTRAINT leave_balances_valid CHECK (used_hours >= 0 AND entitlement_hours >= 0)
);

CREATE INDEX IF NOT EXISTS leave_balances_employee_idx
  ON public.leave_balances(employee_id, year);

-- Enable RLS
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- Employees see own balances
CREATE POLICY "leave_balances_select_own"
  ON public.leave_balances FOR SELECT
  USING (employee_id = auth.uid() OR public.is_admin() OR public.is_finance());

-- Only admin/finance can manage balances
CREATE POLICY "leave_balances_insert_admin"
  ON public.leave_balances FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_finance());

CREATE POLICY "leave_balances_update_admin"
  ON public.leave_balances FOR UPDATE
  USING (public.is_admin() OR public.is_finance())
  WITH CHECK (public.is_admin() OR public.is_finance());

-- Auto-update used_hours when leave request is approved
CREATE OR REPLACE FUNCTION public.update_leave_balance()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    INSERT INTO public.leave_balances (employee_id, year, leave_type, used_hours)
    VALUES (
      NEW.employee_id,
      EXTRACT(YEAR FROM NEW.start_date)::integer,
      NEW.leave_type,
      NEW.total_hours
    )
    ON CONFLICT (employee_id, year, leave_type)
    DO UPDATE SET used_hours = leave_balances.used_hours + EXCLUDED.used_hours;
  END IF;

  -- Reverse if un-approved
  IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
    UPDATE public.leave_balances
    SET used_hours = GREATEST(0, used_hours - OLD.total_hours)
    WHERE employee_id = OLD.employee_id
      AND year = EXTRACT(YEAR FROM OLD.start_date)::integer
      AND leave_type = OLD.leave_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  CREATE TRIGGER leave_request_balance_trigger
    AFTER UPDATE ON public.leave_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_leave_balance();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
