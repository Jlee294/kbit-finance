-- ============================================================
-- 0018 — Bổ sung tax_code + bảng audit XML import
-- ============================================================

-- MST cho NCC và KH (dùng cho parser XML hóa đơn TT 78)
alter table suppliers add column if not exists tax_code text;
alter table customers add column if not exists tax_code text;

create index if not exists idx_suppliers_tax_code on suppliers(tax_code) where tax_code is not null;
create index if not exists idx_customers_tax_code on customers(tax_code) where tax_code is not null;

-- Bảng audit file XML đã import (chống import trùng + theo dõi)
create table if not exists xml_imports (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('invoice','bank')),
  filename        text not null,
  invoice_no      text,                      -- nếu là invoice
  invoice_symbol  text,
  bank_account_id uuid references bank_accounts(id),
  txn_count       integer not null default 0,
  created_records jsonb,                     -- danh sách id records đã tạo
  uploaded_by     uuid references users(id),
  uploaded_at     timestamptz not null default now()
);

create index if not exists idx_xml_imports_invoice
  on xml_imports(invoice_symbol, invoice_no)
  where kind = 'invoice';

alter table xml_imports enable row level security;
drop policy if exists "xml_imports_select" on xml_imports;
drop policy if exists "xml_imports_insert" on xml_imports;
create policy "xml_imports_select" on xml_imports for select using (kbit_role() in ('admin','ceo','chief_accountant','accountant','viewer'));
create policy "xml_imports_insert" on xml_imports for insert with check (kbit_can_edit());
