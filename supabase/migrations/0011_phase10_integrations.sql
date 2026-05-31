-- ============================================================
--  Migration 0011 — Phase 10: Integrations patch
--  • tasks.note    (thiếu trong live DB)
--  • synced_to_sheet_at cho income + expense (Google Sheets sync)
-- ============================================================

-- Patch: tasks.note bị thiếu trong live DB
alter table tasks
  add column if not exists note text;

-- Sheets 1-way sync: đánh dấu row đã đẩy lên Google Sheets
alter table income_transactions
  add column if not exists synced_to_sheet_at timestamptz;

alter table expense_transactions
  add column if not exists synced_to_sheet_at timestamptz;

-- Index để cron sync chỉ lấy các row chưa sync
create index if not exists idx_income_sheet_sync
  on income_transactions(synced_to_sheet_at)
  where status = 'approved' and synced_to_sheet_at is null;

create index if not exists idx_expense_sheet_sync
  on expense_transactions(synced_to_sheet_at)
  where status = 'approved' and synced_to_sheet_at is null;
