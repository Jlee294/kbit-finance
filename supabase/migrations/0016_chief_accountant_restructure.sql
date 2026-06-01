-- ============================================================
-- 0016 — Tái cấu trúc theo phản hồi Kế toán trưởng
--   1. Thêm fields hóa đơn cho customer_orders / supplier_orders
--   2. View bank_ledger gộp thu + chi (Ngân hàng = 1 menu)
--   3. Bảng cash_book cho "Chứng từ khác" (CTK trong file mẫu)
-- ============================================================

-- ── 1. Bổ sung fields hóa đơn cho customer_orders ────────────────────────────
alter table customer_orders
  add column if not exists invoice_template  text,            -- Ký hiệu mẫu HĐ
  add column if not exists invoice_symbol    text,            -- Ký hiệu HĐ
  add column if not exists invoice_no        text,            -- Số HĐ
  add column if not exists invoice_date      date,            -- Ngày HĐ
  add column if not exists customer_tax_code text,            -- MST khách
  add column if not exists vat_amount        numeric(18,2),   -- Số tiền VAT tuyệt đối
  add column if not exists invoice_kind      text default 'standard'
    check (invoice_kind in ('standard','adjusted','replaced','cancelled')),
  add column if not exists dinh_khoan_no     text,            -- Tài khoản Nợ
  add column if not exists dinh_khoan_co     text;            -- Tài khoản Có

create index if not exists idx_co_invoice_date on customer_orders(invoice_date desc);
create index if not exists idx_co_invoice_no   on customer_orders(invoice_no);

-- Fields trên dòng hàng để hỗ trợ quy đổi đơn vị (NK_Ban [11]-[15])
alter table customer_order_items
  add column if not exists ty_le_quy_doi    numeric(18,6) default 1,
  add column if not exists unit_converted   text,
  add column if not exists qty_converted    numeric(18,4),
  add column if not exists price_converted  numeric(18,4),
  add column if not exists amount_converted numeric(18,2),
  add column if not exists dinh_khoan       text;

-- ── 2. Bổ sung tương tự cho supplier_orders ──────────────────────────────────
alter table supplier_orders
  add column if not exists invoice_template  text,
  add column if not exists invoice_symbol    text,
  add column if not exists invoice_no        text,
  add column if not exists invoice_date      date,
  add column if not exists supplier_tax_code text,
  add column if not exists vat_amount        numeric(18,2),
  add column if not exists invoice_kind      text default 'standard'
    check (invoice_kind in ('standard','adjusted','replaced','cancelled')),
  add column if not exists dinh_khoan_no     text,
  add column if not exists dinh_khoan_co     text;

create index if not exists idx_so_invoice_date on supplier_orders(invoice_date desc);

alter table supplier_order_items
  add column if not exists chiet_khau_tm    numeric(18,2) default 0,  -- CKTM
  add column if not exists ty_le_quy_doi    numeric(18,6) default 1,
  add column if not exists unit_converted   text,
  add column if not exists qty_converted    numeric(18,4),
  add column if not exists price_converted  numeric(18,4),
  add column if not exists amount_converted numeric(18,2),
  add column if not exists dinh_khoan       text;

-- ── 3. View bank_ledger: gộp thu + chi để Ngân hàng dùng 1 nguồn ─────────────
create or replace view bank_ledger as
select
  i.id                       as id,
  'thu'::text                as direction,           -- Thu / Chi
  i.txn_date                 as txn_date,
  i.company_id               as company_id,
  i.bank_account_id          as bank_account_id,
  null::uuid                 as supplier_id,
  i.customer_id              as customer_id,
  i.amount                   as amount_local,        -- tiền theo currency của TK ngân hàng
  coalesce(i.amount_vnd, i.amount) as amount_vnd,
  coalesce(i.currency::text, 'VND') as currency,
  null::text                 as region,
  i.note                     as note,
  i.status                   as status,
  i.is_unassigned            as is_unassigned,
  i.project_id               as project_id,
  i.created_at               as created_at
from income_transactions i
union all
select
  e.id,
  'chi'::text                as direction,
  e.txn_date,
  e.company_id,
  e.bank_account_id,
  e.supplier_id,
  null::uuid                 as customer_id,
  case when e.region = 'KR' then e.amount_krw else e.amount_vnd end as amount_local,
  e.amount_vnd,
  case when e.region = 'KR' then 'KRW' else 'VND' end as currency,
  e.region::text             as region,
  e.note,
  e.status,
  false                      as is_unassigned,
  e.project_id,
  e.created_at
from expense_transactions e;

-- ── 4. Chứng từ khác (CTK) — quỹ tiền mặt / phát sinh kế toán linh tinh ──────
create table if not exists cash_book (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  ky_hieu          text,                              -- Ký hiệu chứng từ (PT01, PC02...)
  txn_date         date not null,
  doi_tac          text,                              -- Tên người rút-nộp tiền
  ma_doi_tac       text,                              -- Mã đối tác (tham chiếu KH/NCC)
  noi_dung         text not null,
  so_tien          numeric(18,2) not null check (so_tien <> 0),
  -- so_tien > 0 = thu / so_tien < 0 = chi, hoặc dùng direction tường minh:
  direction        text not null default 'chi' check (direction in ('thu','chi')),
  ghi_chu          text,
  dinh_khoan_no    text,                              -- Định khoản Nợ
  dinh_khoan_co    text,                              -- Định khoản Có
  status           text not null default 'draft' check (status in ('draft','confirmed')),
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_cb_txn_date on cash_book(txn_date desc);
create index if not exists idx_cb_company  on cash_book(company_id);

alter table cash_book enable row level security;

drop policy if exists "cb_select" on cash_book;
drop policy if exists "cb_insert" on cash_book;
drop policy if exists "cb_update" on cash_book;
drop policy if exists "cb_delete" on cash_book;

create policy "cb_select" on cash_book
  for select using (kbit_role() in ('admin','ceo','chief_accountant','accountant','viewer'));
create policy "cb_insert" on cash_book
  for insert with check (kbit_can_edit());
create policy "cb_update" on cash_book
  for update using (kbit_can_edit());
create policy "cb_delete" on cash_book
  for delete using (kbit_role() in ('admin','chief_accountant'));
