-- Add progress_status column to track real-time sync progress
alter table public.directory_sync_runs
  add column if not exists progress_status text;
