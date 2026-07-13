-- Adds snooze support to receipts so users can push a stale receipt out 24h
-- from the interactive Block Kit card. Also re-arms `alerted` on snooze so the
-- receipts cron re-fires once the snooze window passes.
alter table receipts add column if not exists snooze_until timestamptz;

-- Speeds up open-receipt lookups for the receipts cron.
create index if not exists idx_receipts_open on receipts(resolved, created_at);
