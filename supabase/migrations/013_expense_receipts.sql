-- 013_expense_receipts.sql
-- Storage bucket for expense receipt photos and receipt path column.

-- Add receipt_path column to expense_entries
ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS receipt_path text;

-- Storage bucket for receipts (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Users upload receipts to their own folder
CREATE POLICY "Users upload own receipt"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users and managers can read receipts
CREATE POLICY "Users read own receipt"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_manager()
      OR public.is_finance()
      OR public.is_admin()
    )
  );

-- Users can delete their own receipts
CREATE POLICY "Users delete own receipt"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
