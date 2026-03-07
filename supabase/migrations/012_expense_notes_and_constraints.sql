-- 012_expense_notes_and_constraints.sql
-- Add per-day notes column to expense_entries and unique constraint on employee_number.

-- #7: Add notes column for general per-day notes (separate from other_note)
ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS notes text;

-- #15: Prevent duplicate employee numbers
CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_number_unique
  ON public.profiles(employee_number)
  WHERE employee_number IS NOT NULL;
