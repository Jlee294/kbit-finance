-- =============================================================================
-- 0056 — NỀN TẢNG LUỒNG KẾ TOÁN + IMPORT CÓ KIỂM SOÁT
-- Quy tắc chốt 2026-07-30:
--   • Quà tặng: kê VAT, không doanh thu/công nợ, vẫn chạy kho nếu có mã hàng.
--   • Nhật ký bán/mua là tập con có mã hàng của bảng kê.
--   • AP mua trong nước gồm VAT; nhập khẩu tách từng chủ nợ/đồng tiền.
--   • Có tiền mặt đầu kỳ, danh mục phân loại mở rộng và staging theo batch.
-- =============================================================================

-- ── 1) Bán ra: tách kê thuế / doanh thu / công nợ ─────────────────────────────
alter table customer_orders
  add column if not exists is_gift boolean not null default false,
  add column if not exists recognize_revenue boolean not null default true,
  add column if not exists creates_receivable boolean not null default true,
  add column if not exists source_fingerprint text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_orders_gift_semantics'
  ) then
    alter table customer_orders
      add constraint customer_orders_gift_semantics
      check (not is_gift or (recognize_revenue = false and creates_receivable = false));
  end if;
end $$;

create unique index if not exists ux_customer_orders_source_fingerprint
  on customer_orders(company_id, source_fingerprint)
  where source_fingerprint is not null;

-- View nguồn cho menu Nhật ký: chỉ chứng từ có ít nhất một dòng gắn mã hàng.
create or replace view sales_inventory_journal
with (security_invoker = true)
as
select co.*
from customer_orders co
where exists (
  select 1
  from customer_order_items coi
  where coi.order_id = co.id
    and coi.product_id is not null
);

create or replace view purchase_inventory_journal
with (security_invoker = true)
as
select so.*
from supplier_orders so
where exists (
  select 1
  from supplier_order_items soi
  where soi.order_id = so.id
    and soi.product_id is not null
);

-- ── 2) Công nợ mua vào đúng bản chất ─────────────────────────────────────────
-- Với mua trong nước: trả NCC = tiền hàng + VAT hóa đơn.
-- Với nhập khẩu: supplier_orders chỉ đại diện tiền hàng của NCC nước ngoài;
-- thuế/phí/chủ nợ khác nằm ở import_cost_components.
alter table supplier_orders
  add column if not exists payable_total numeric(18,2)
    generated always as (
      case
        when order_type = 'domestic'
          then goods_value + coalesce(vat_amount, 0)
        else goods_value
      end
    ) stored,
  add column if not exists payable_outstanding numeric(18,2)
    generated always as (
      case
        when order_type = 'domestic'
          then goods_value + coalesce(vat_amount, 0) - amount_paid
        else goods_value - amount_paid
      end
    ) stored,
  add column if not exists source_fingerprint text;

create unique index if not exists ux_supplier_orders_source_fingerprint
  on supplier_orders(company_id, source_fingerprint)
  where source_fingerprint is not null;

create table if not exists import_cost_components (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  supplier_order_id    uuid not null references supplier_orders(id) on delete cascade,
  kind                  text not null check (
    kind in ('goods','import_duty','import_vat','freight','service','other')
  ),
  creditor_type         text not null check (
    creditor_type in ('supplier','tax_authority','service_provider','other')
  ),
  creditor_supplier_id uuid references suppliers(id),
  description           text,
  currency              currency_code not null default 'VND',
  amount                numeric(18,2) not null check (amount >= 0),
  exchange_rate         numeric(18,6) not null default 1 check (exchange_rate > 0),
  amount_vnd            numeric(18,2)
    generated always as (round(amount * exchange_rate, 2)) stored,
  capitalizable         boolean not null default true,
  document_no           text,
  document_date         date,
  source_fingerprint    text,
  created_by            uuid references users(id),
  created_at            timestamptz not null default now()
);

create index if not exists idx_import_cost_components_order
  on import_cost_components(supplier_order_id);
create unique index if not exists ux_import_cost_components_source
  on import_cost_components(company_id, source_fingerprint)
  where source_fingerprint is not null;

alter table import_cost_components enable row level security;
create policy import_cost_components_sel on import_cost_components
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));
create policy import_cost_components_ins on import_cost_components
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy import_cost_components_upd on import_cost_components
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
  with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy import_cost_components_del on import_cost_components
  for delete using (kbit_can_approve() and kbit_can_access_company(company_id));

-- ── 3) Danh mục phân loại dòng mua không qua kho ──────────────────────────────
create table if not exists accounting_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  code        text not null,
  name        text not null,
  treatment   text not null check (
    treatment in (
      'inventory','expense','prepaid','tool','fixed_asset','tax_fee',
      'pass_through','contract_penalty','other'
    )
  ),
  is_active   boolean not null default true,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists ux_accounting_categories_scope_code
  on accounting_categories(
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(code)
  );

insert into accounting_categories(company_id, code, name, treatment)
values
  (null, 'CHI_PHI',  'Chi phí trong kỳ', 'expense'),
  (null, 'TRA_TRUOC', 'Chi phí trả trước', 'prepaid'),
  (null, 'CCDC', 'Công cụ dụng cụ', 'tool'),
  (null, 'TSCĐ', 'Tài sản cố định', 'fixed_asset'),
  (null, 'THUE_PHI', 'Thuế, phí', 'tax_fee'),
  (null, 'THU_CHI_HO', 'Thu hộ, chi hộ', 'pass_through'),
  (null, 'PHAT_HD', 'Phạt hợp đồng', 'contract_penalty'),
  (null, 'KHAC', 'Khác', 'other')
on conflict do nothing;

alter table accounting_categories enable row level security;
create policy accounting_categories_sel on accounting_categories
  for select using (
    kbit_role() is not null
    and (company_id is null or kbit_can_access_company(company_id))
  );
create policy accounting_categories_write on accounting_categories
  for all using (
    company_id is not null
    and kbit_can_edit()
    and kbit_can_access_company(company_id)
  ) with check (
    company_id is not null
    and kbit_can_edit()
    and kbit_can_access_company(company_id)
  );

alter table supplier_order_items
  add column if not exists accounting_treatment text,
  add column if not exists accounting_category_id uuid references accounting_categories(id);

update supplier_order_items
set accounting_treatment = case when product_id is not null then 'inventory' else 'other' end
where accounting_treatment is null;

alter table supplier_order_items
  alter column accounting_treatment set default 'other',
  alter column accounting_treatment set not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'supplier_order_items_treatment_check'
  ) then
    alter table supplier_order_items
      add constraint supplier_order_items_treatment_check check (
        accounting_treatment in (
          'inventory','expense','prepaid','tool','fixed_asset','tax_fee',
          'pass_through','contract_penalty','other'
        )
      );
  end if;
end $$;

-- ── 4) Tiền mặt đầu kỳ + nguồn import ─────────────────────────────────────────
create table if not exists cash_opening_balances (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  year        int not null check (year between 2020 and 2099),
  amount      numeric(18,2) not null default 0,
  note        text,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(company_id, year)
);

alter table cash_opening_balances enable row level security;
create policy cash_opening_balances_sel on cash_opening_balances
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));
create policy cash_opening_balances_ins on cash_opening_balances
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy cash_opening_balances_upd on cash_opening_balances
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
  with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy cash_opening_balances_del on cash_opening_balances
  for delete using (kbit_can_approve() and kbit_can_access_company(company_id));

-- ── 5) Lô import, file, dòng staging và cổng kiểm tra ──────────────────────────
create table if not exists import_batches (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  period_from    date not null,
  period_to      date not null,
  source_label   text,
  status         text not null default 'draft' check (
    status in (
      'draft','parsed','needs_review','validated','approved','posted',
      'failed','rejected','rolled_back'
    )
  ),
  total_files    int not null default 0,
  total_rows     int not null default 0,
  error_count    int not null default 0,
  warning_count  int not null default 0,
  created_by     uuid references users(id),
  approved_by    uuid references users(id),
  posted_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_to >= period_from)
);

create table if not exists import_files (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references import_batches(id) on delete cascade,
  kind        text not null check (
    kind in (
      'sales_listing','sales_journal','purchase_listing','purchase_journal',
      'inventory','receivable_opening','payable_opening','bank','cash'
    )
  ),
  filename    text not null,
  sha256      text not null,
  sheet_name  text,
  row_count   int not null default 0,
  column_map  jsonb not null default '{}'::jsonb,
  parsed_at   timestamptz,
  created_at  timestamptz not null default now(),
  unique(batch_id, sha256)
);

create table if not exists import_staging_rows (
  id                  uuid primary key default gen_random_uuid(),
  batch_id            uuid not null references import_batches(id) on delete cascade,
  file_id             uuid not null references import_files(id) on delete cascade,
  row_number          int not null,
  row_kind            text not null,
  reconciliation_key  text,
  raw_data             jsonb not null,
  normalized_data      jsonb not null default '{}'::jsonb,
  mapping_status       text not null default 'pending' check (
    mapping_status in ('pending','matched','created','ignored','error')
  ),
  error_codes          text[] not null default '{}',
  warning_codes        text[] not null default '{}',
  target_table         text,
  target_id            uuid,
  created_at           timestamptz not null default now(),
  unique(file_id, row_number)
);

create table if not exists import_checks (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references import_batches(id) on delete cascade,
  check_code      text not null,
  status          text not null check (status in ('pending','passed','failed','explained')),
  expected_value  numeric,
  actual_value    numeric,
  difference      numeric generated always as (
    coalesce(actual_value, 0) - coalesce(expected_value, 0)
  ) stored,
  source_ref      text,
  explanation     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(batch_id, check_code, source_ref)
);

create index if not exists idx_import_batches_company_created
  on import_batches(company_id, created_at desc);
create index if not exists idx_import_staging_batch_kind
  on import_staging_rows(batch_id, row_kind);
create index if not exists idx_import_staging_reconcile
  on import_staging_rows(batch_id, reconciliation_key);
create index if not exists idx_import_checks_failed
  on import_checks(batch_id, status)
  where status in ('failed','pending');

alter table import_batches enable row level security;
alter table import_files enable row level security;
alter table import_staging_rows enable row level security;
alter table import_checks enable row level security;

create policy import_batches_sel on import_batches
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));
create policy import_batches_ins on import_batches
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy import_batches_upd on import_batches
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
  with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy import_batches_del on import_batches
  for delete using (
    kbit_can_approve()
    and kbit_can_access_company(company_id)
    and status in ('draft','failed','rejected','rolled_back')
  );

create policy import_files_sel on import_files
  for select using (
    exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  );
create policy import_files_write on import_files
  for all using (
    kbit_can_edit() and exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  ) with check (
    kbit_can_edit() and exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  );

create policy import_staging_rows_sel on import_staging_rows
  for select using (
    exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  );
create policy import_staging_rows_write on import_staging_rows
  for all using (
    kbit_can_edit() and exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  ) with check (
    kbit_can_edit() and exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  );

create policy import_checks_sel on import_checks
  for select using (
    exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  );
create policy import_checks_write on import_checks
  for all using (
    kbit_can_edit() and exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  ) with check (
    kbit_can_edit() and exists (
      select 1 from import_batches b
      where b.id = batch_id and kbit_can_access_company(b.company_id)
    )
  );

-- Liên kết mọi chứng từ được tạo bởi batch để truy vết và rollback.
alter table customer_orders add column if not exists import_batch_id uuid references import_batches(id);
alter table supplier_orders add column if not exists import_batch_id uuid references import_batches(id);
alter table income_transactions
  add column if not exists import_batch_id uuid references import_batches(id),
  add column if not exists source_fingerprint text;
alter table expense_transactions
  add column if not exists import_batch_id uuid references import_batches(id),
  add column if not exists source_fingerprint text;
alter table cash_book
  add column if not exists import_batch_id uuid references import_batches(id),
  add column if not exists source_fingerprint text;
alter table warehouse_transactions
  add column if not exists import_batch_id uuid references import_batches(id);

create unique index if not exists ux_income_source_fingerprint
  on income_transactions(company_id, source_fingerprint)
  where source_fingerprint is not null;
create unique index if not exists ux_expense_source_fingerprint
  on expense_transactions(company_id, source_fingerprint)
  where source_fingerprint is not null;
create unique index if not exists ux_cash_source_fingerprint
  on cash_book(company_id, source_fingerprint)
  where source_fingerprint is not null;

-- ── 6) Vá bảo mật số dư công nợ đầu kỳ ────────────────────────────────────────
drop policy if exists "Authenticated users can read debt_opening_balances"
  on debt_opening_balances;
drop policy if exists "Authenticated users can insert debt_opening_balances"
  on debt_opening_balances;
drop policy if exists "Authenticated users can update debt_opening_balances"
  on debt_opening_balances;
drop policy if exists "Authenticated users can delete debt_opening_balances"
  on debt_opening_balances;

create policy debt_opening_balances_sel on debt_opening_balances
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));
create policy debt_opening_balances_ins on debt_opening_balances
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy debt_opening_balances_upd on debt_opening_balances
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
  with check (kbit_can_edit() and kbit_can_access_company(company_id));
create policy debt_opening_balances_del on debt_opening_balances
  for delete using (kbit_can_approve() and kbit_can_access_company(company_id));

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'debt_opening_one_normal_side'
  ) then
    alter table debt_opening_balances
      add constraint debt_opening_one_normal_side
      check (not (debit_amount > 0 and credit_amount > 0)) not valid;
  end if;
end $$;

comment on table import_batches is
  'Lô nhập có staging/đối chiếu. Chỉ validated -> approved -> posted; mọi dòng phải truy vết được về file nguồn.';
comment on column customer_orders.is_gift is
  'Quà tặng vẫn kê VAT nhưng không doanh thu/công nợ; dòng có product_id vẫn xuất kho và ghi giá vốn.';
