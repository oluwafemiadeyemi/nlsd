-- Add profiles_provisioned column to track auto-created profiles during directory sync.
alter table public.directory_sync_runs
  add column if not exists profiles_provisioned int not null default 0;
