-- =====================================================================
-- KBIT — SCHEMA CƠ SỞ DỮ LIỆU (Supabase / PostgreSQL)
-- Phiên bản nháp 1 (29/05/2026) — dùng cho Sonnet dựng DB.
-- Đã áp dụng các đề xuất: P2 (tách trạng thái), P3 (chi hộ=phải thu),
--   P5 (nhập khẩu+giá vốn), P6 (chi KR hàng/dịch vụ), P7 (chênh lệch tỷ giá),
--   P8 (phân bổ thu), P11 (loại trừ nội bộ), P12 (sản phẩm+thuế TNDN), F3 (documents).
-- LƯU Ý: phải CHẠY THỬ trên Supabase dev để xác nhận (đây là bước test).
-- Phần [⏳ CHỜ CHỐT] = phụ thuộc 6 câu treo; đã đặt giả định tạm.
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- =========================== ENUMS ===================================
create type user_role          as enum ('admin','chief_accountant','accountant','viewer');
create type country_code       as enum ('VN','KR');
create type currency_code      as enum ('VND','KRW');
create type fulfillment_status as enum ('draft','confirmed','awaiting_goods','delivered');   -- P2 trục giao hàng (⏳ A7: tên 'awaiting_goods')
create type payment_status     as enum ('unpaid','partial','paid');                          -- P2 trục thanh toán (suy từ công nợ)
create type txn_status         as enum ('draft','confirmed','approved','void');
create type expense_region     as enum ('VN','KR');
create type expense_kind       as enum ('goods','service');                                  -- P6 (cho KR): tiền hàng / phí dịch vụ
create type supplier_order_type as enum ('domestic','import');                               -- P5
create type doc_entity_type    as enum ('customer_order','supplier_order','income','expense');-- F3 polymorphic sạch
create type period_status      as enum ('open','locked');
create type receivable_status  as enum ('outstanding','collected');                          -- P3 chi hộ
create type task_status        as enum ('open','in_progress','done','overdue');
create type health_light       as enum ('green','yellow','red');                             -- P10

-- ============ BẢNG users (phải tạo TRƯỚC các hàm kbit_role, kbit_can_edit...) ===
create table users (
  id         uuid primary key default gen_random_uuid(),
  auth_id    uuid unique not null,            -- = auth.users.id (Supabase Auth)
  full_name  text not null,
  email      text unique,
  role       user_role not null default 'viewer',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===================== HÀM HỖ TRỢ PHÂN QUYỀN =========================
-- Lấy role của user đang đăng nhập (map auth.uid() -> bảng users)
create or replace function kbit_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where auth_id = auth.uid() and is_active = true
$$;

create or replace function kbit_is_staff() returns boolean
language sql stable as $$ select kbit_role() in ('admin','chief_accountant','accountant') $$;

create or replace function kbit_can_edit() returns boolean
language sql stable as $$ select kbit_role() in ('admin','chief_accountant','accountant') $$;

create or replace function kbit_can_approve() returns boolean
language sql stable as $$ select kbit_role() in ('admin','chief_accountant') $$;

create or replace function kbit_is_admin() returns boolean
language sql stable as $$ select kbit_role() = 'admin' $$;

-- Trigger dùng chung: cập nhật updated_at
create or replace function set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ============ TẦNG 1 — NỀN TẢNG =====================================
create table companies (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  country       country_code not null,
  base_currency currency_code not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  code        text not null,
  name        text not null,
  start_date  date,
  end_date    date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, code)
);

-- ============ TẦNG 2 — MASTER DATA ==================================
create table customers (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  phone      text,
  note       text,
  prepaid_balance numeric(18,2) not null default 0,   -- P8: số dư trả trước của KH
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  country    country_code not null default 'VN',
  phone      text,
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bank_accounts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  name        text not null,
  currency    currency_code not null,
  account_no  text,
  balance     numeric(18,2) not null default 0,   -- ⚠ DEPRECATED (M1): KHÔNG ghi/dùng. Số dư = VIEW v_bank_balances (tính theo currency tài khoản)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table exchange_rates (
  id            uuid primary key default gen_random_uuid(),
  currency_from currency_code not null,
  currency_to   currency_code not null,
  rate          numeric(18,6) not null check (rate > 0),
  rate_date     date not null,
  source        text,                                -- ⏳ A8: nguồn tỷ giá
  created_at    timestamptz not null default now(),
  unique (currency_from, currency_to, rate_date)
);

create table accounting_periods (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),   -- F5: khóa theo (công ty, kỳ)
  period      text not null,                            -- 'YYYY-MM'
  status      period_status not null default 'open',
  locked_at   timestamptz,
  locked_by   uuid references users(id),
  unique (company_id, period)
);

create table products (                                 -- P12: danh mục sản phẩm chuẩn
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  unit       text not null default 'cái',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ TẦNG 3 — ĐƠN HÀNG =====================================
create table customer_orders (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id),
  project_id          uuid references projects(id),
  customer_id         uuid not null references customers(id),
  order_code          text unique not null,             -- F2: 'FEMI-0526-01' (có sequence)
  order_date          date not null,
  delivery_date       date,
  grand_total         numeric(18,2) not null default 0,
  amount_paid         numeric(18,2) not null default 0,
  outstanding         numeric(18,2) generated always as (grand_total - amount_paid) stored,
  fulfillment_status  fulfillment_status not null default 'draft',  -- P2 trục 1
  payment_status      payment_status not null default 'unpaid',     -- P2 trục 2 (app cập nhật theo outstanding)
  lot_no              text,
  expiry_date         date,
  is_intercompany     boolean not null default false,   -- P11
  counterpart_company_id uuid references companies(id),  -- P11: bán cho công ty nào trong Group
  created_by          uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table customer_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references customer_orders(id) on delete cascade,
  product_id  uuid references products(id),
  description text,
  qty         numeric(18,2) not null default 1,
  unit_price  numeric(18,2) not null default 0,
  line_total  numeric(18,2) generated always as (qty * unit_price) stored
);

create table supplier_orders (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  project_id      uuid references projects(id),
  supplier_id     uuid not null references suppliers(id),
  order_code      text unique not null,
  order_type      supplier_order_type not null default 'domestic',  -- P5
  order_date      date not null,
  currency        currency_code not null default 'VND',
  -- [QUY ƯỚC C3 — giả định, chờ anh chốt] mọi cột tiền của đơn (goods_value, import_duty, vat_import,
  --   other_fees, amount_paid, cost_total, outstanding) lưu theo NGUYÊN TỆ của đơn = currency.
  --   Quy VND khi cần (giá vốn nhập kho / hợp nhất) qua exchange_rate. KHÔNG trộn đơn vị.
  goods_value     numeric(18,2) not null default 0,                 -- giá mua hàng (nguyên tệ)
  import_duty     numeric(18,2) not null default 0,                 -- P5 thuế nhập khẩu
  vat_import      numeric(18,2) not null default 0,                 -- P5 VAT khâu NK (khấu trừ riêng)
  other_fees      numeric(18,2) not null default 0,                 -- P5 phí hải quan... (⏳ A3)
  cost_total      numeric(18,2) generated always as (goods_value + import_duty + other_fees) stored, -- P5 giá vốn (KHÔNG gồm VAT khấu trừ)
  amount_paid     numeric(18,2) not null default 0,
  outstanding     numeric(18,2) generated always as (goods_value + import_duty + vat_import + other_fees - amount_paid) stored,
  is_intercompany boolean not null default false,                    -- P11
  counterpart_company_id uuid references companies(id),
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table supplier_order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references supplier_orders(id) on delete cascade,
  product_id  uuid references products(id),
  description text,
  qty         numeric(18,2) not null default 1,
  unit_price  numeric(18,2) not null default 0,
  line_total  numeric(18,2) generated always as (qty * unit_price) stored,
  unit_cost   numeric(18,2)                                          -- P5 giá vốn/đơn vị (app phân bổ cost_total)
);

-- ============ TẦNG 4 — GIAO DỊCH ====================================
create table income_transactions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id),
  bank_account_id uuid not null references bank_accounts(id),
  customer_id     uuid not null references customers(id),
  amount          numeric(18,2) not null check (amount > 0),
  txn_date        date not null,
  is_unassigned   boolean not null default false,   -- P8: tiền cọc/chưa gắn đơn
  note            text,
  status          txn_status not null default 'draft',
  created_by      uuid references users(id),
  approved_by     uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table payment_allocations (                   -- P8: 1 phiếu thu ↔ nhiều đơn
  id                uuid primary key default gen_random_uuid(),
  income_id         uuid not null references income_transactions(id) on delete cascade,
  customer_order_id uuid not null references customer_orders(id),
  allocated_amount  numeric(18,2) not null check (allocated_amount > 0)
);

create table expense_transactions (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  bank_account_id  uuid not null references bank_accounts(id),
  supplier_id      uuid references suppliers(id),
  supplier_order_id uuid references supplier_orders(id),    -- nếu là trả công nợ NCC
  region           expense_region not null,
  txn_date         date not null,                          -- C1 fix: ngày giao dịch thực (khác created_at=ngày nhập); dùng cho khóa kỳ/báo cáo/thư mục Drive
  note             text,                                   -- C1 fix: expense trước đây thiếu cột note
  -- Trục 1: hóa đơn VAT (P3)
  has_vat          boolean not null default false,
  vat_amount       numeric(18,2) not null default 0,
  -- Trục 2: chi phí công ty / chi hộ (P3)
  is_chi_ho        boolean not null default false,
  chi_ho_person    text,
  expense_category text,                                    -- Business/HR/R&D... (P12 gắn operation_library)
  operation_id     uuid,                                    -- FK -> operation_library (khai bên dưới)
  -- Tiền tệ (P6, P7)
  expense_kind     expense_kind,                            -- chỉ dùng khi region='KR' (⏳ A2)
  amount_vnd       numeric(18,2) not null check (amount_vnd > 0),
  amount_krw       numeric(18,2),                           -- chỉ khi region='KR'
  exchange_rate    numeric(18,6),                           -- chỉ khi region='KR' (⏳ A8)
  is_intercompany  boolean not null default false,          -- P11
  counterpart_company_id uuid references companies(id),
  status           txn_status not null default 'draft',
  created_by       uuid references users(id),
  approved_by      uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Ràng buộc nhất quán KR
  constraint chk_kr_fields check (
    (region = 'KR' and amount_krw is not null and exchange_rate is not null)
    or region = 'VN'
  )
);

create table internal_receivables (                  -- P3: chi hộ -> thu lại
  id               uuid primary key default gen_random_uuid(),
  expense_id       uuid not null references expense_transactions(id),
  person           text not null,
  amount           numeric(18,2) not null check (amount > 0),
  collected_amount numeric(18,2) not null default 0,
  status           receivable_status not null default 'outstanding',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table fx_gain_loss (                           -- P7: chênh lệch tỷ giá
  id            uuid primary key default gen_random_uuid(),
  ref_type      text not null,                         -- 'expense' | 'supplier_payment'
  ref_id        uuid not null,
  currency      currency_code not null,
  rate_booked   numeric(18,6) not null,
  rate_settled  numeric(18,6) not null,
  amount_fc     numeric(18,2) not null,                -- số ngoại tệ
  gain_loss_vnd numeric(18,2) not null,                -- dương=lãi, âm=lỗ
  created_at    timestamptz not null default now()
);

-- ============ TẦNG 5 — CHỨNG TỪ & NGHIỆP VỤ ========================
create table document_types (
  id   uuid primary key default gen_random_uuid(),
  code text unique not null,                            -- PO, VAT_INVOICE, BANK_SLIP, COA, CUSTOMS_DECL...
  name text not null
);

create table operation_library (                       -- P12, Module 1
  id                   uuid primary key default gen_random_uuid(),
  code                 text unique not null,
  name                 text not null,
  group_name           text,                            -- Mua/Bán/Chi phí/Lương/Thuế/Tài sản
  tax_gtgt             text,
  tax_tndn_deductible  boolean,                          -- P12: chi phí được trừ TNDN?
  tax_tncn             text,
  tax_fct              text,                             -- thuế nhà thầu
  required_doc_type_ids uuid[] not null default '{}',    -- checklist hồ sơ bắt buộc
  recommended_doc_type_ids uuid[] not null default '{}',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- FK trễ cho expense_transactions.operation_id
alter table expense_transactions
  add constraint fk_expense_operation foreign key (operation_id) references operation_library(id);

create table operation_library_history (
  id           uuid primary key default gen_random_uuid(),
  operation_id uuid not null references operation_library(id),
  changed_by   uuid references users(id),
  changed_at   timestamptz not null default now(),
  old_data     jsonb,
  new_data     jsonb
);

create table documents (                               -- F3: entity_type + entity_id (sạch hơn 4 cột)
  id               uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references document_types(id),
  entity_type      doc_entity_type not null,
  entity_id        uuid not null,
  file_name        text not null,
  file_url         text,
  drive_file_id    text,
  drive_folder_id  text,
  is_verified      boolean not null default false,
  verified_by      uuid references users(id),
  uploaded_by      uuid references users(id),
  created_at       timestamptz not null default now()
);
create index idx_documents_entity on documents(entity_type, entity_id);

-- ============ TẦNG 6 — KIỂM SOÁT & PHÂN TÍCH =======================
create table audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  uuid,
  action     text not null,                             -- INSERT/UPDATE/DELETE
  changed_by uuid references users(id),                 -- H6: từ auth.uid()→users.id (M2 fix: thêm FK để embed PostgREST)
  changed_at timestamptz not null default now(),
  old_data   jsonb,
  new_data   jsonb
);

create table approval_requests (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid not null,
  requested_by uuid references users(id),
  approved_by  uuid references users(id),
  status      text not null default 'pending',          -- pending/approved/rejected
  amount      numeric(18,2),                             -- ⏳ A5: ngưỡng cần 2 cấp
  created_at  timestamptz not null default now()
);

create table tax_compliance_calendar (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  tax_type   text not null,                             -- GTGT/TNDN/TNCN/BCTC/BHXH
  period     text not null,
  due_date   date not null,
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);

create table bank_reconciliations (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_accounts(id),
  period          text not null,
  statement_balance numeric(18,2) not null,
  book_balance    numeric(18,2) not null,
  diff            numeric(18,2) generated always as (statement_balance - book_balance) stored,
  status          text not null default 'open',
  created_at      timestamptz not null default now()
);

create table tax_plans (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  project_id uuid references projects(id),
  year       int not null,
  plan_data  jsonb not null default '{}',               -- kế hoạch vs thực tế
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table risk_thresholds (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id),          -- null = áp chung
  indicator_code text not null,                          -- VD: 'OVERDUE_DEBT', 'DSO'...
  yellow_at      numeric(18,2),
  red_at         numeric(18,2),
  unique (company_id, indicator_code)
);

create table risk_assessments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id),
  assessed_at  timestamptz not null default now(),
  scores       jsonb not null default '{}',              -- điểm/đèn từng nhóm
  overall      health_light not null default 'green'     -- P10 (⏳ A6)
);

create table tasks (                                     -- Module 5
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  related_entity_type text,
  related_entity_id   uuid,
  due_date            date,
  status              task_status not null default 'open',
  assigned_to         uuid references users(id),
  auto_generated      boolean not null default false,    -- auto-task khi thiếu hồ sơ...
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ===================== INDEX phổ biến ================================
create index idx_corders_company on customer_orders(company_id);
create index idx_corders_customer on customer_orders(customer_id);
create index idx_sorders_company on supplier_orders(company_id);
create index idx_income_company on income_transactions(company_id);
create index idx_expense_company on expense_transactions(company_id);
create index idx_alloc_order on payment_allocations(customer_order_id);

-- ===================== TRIGGER updated_at ===========================
-- Áp cho mọi bảng có cột updated_at:
do $$
declare t text;
begin
  foreach t in array array[
    'companies','projects','users','customers','suppliers','bank_accounts','products',
    'customer_orders','supplier_orders','income_transactions','expense_transactions',
    'internal_receivables','operation_library','tax_plans','tasks'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ===================== TRIGGER audit_log (H6) =======================
-- Lấy người thực hiện từ auth.uid() (Supabase tự gắn JWT mỗi request) -> map sang users.id.
-- Cách chuẩn Supabase, KHÔNG cần app set_config thủ công (đã xác minh qua doc Supabase /supabase/supabase).
create or replace function kbit_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from public.users where auth_id = auth.uid();
  insert into audit_log(table_name, record_id, action, changed_by, old_data, new_data)
  values (tg_table_name,
          coalesce(new.id, old.id),
          tg_op, uid,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'customer_orders','supplier_orders','income_transactions','expense_transactions',
    'payment_allocations','internal_receivables','operation_library'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on %1$s for each row execute function kbit_audit();', t);
  end loop;
end $$;

-- ===================== RLS (Row Level Security) =====================
-- Nguyên tắc: staff (admin/KTT/kế toán) đọc tất cả; ghi theo quyền;
--   viewer chỉ đọc; chỉ admin/KTT được duyệt & sửa danh mục nhạy cảm.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','projects','users','customers','suppliers','bank_accounts','exchange_rates',
    'accounting_periods','products','customer_orders','customer_order_items','supplier_orders',
    'supplier_order_items','income_transactions','payment_allocations','expense_transactions',
    'internal_receivables','fx_gain_loss','document_types','operation_library',
    'operation_library_history','documents','audit_log','approval_requests',
    'tax_compliance_calendar','bank_reconciliations','tax_plans','risk_thresholds',
    'risk_assessments','tasks'
  ] loop
    execute format('alter table %s enable row level security;', t);
    -- Đọc: mọi user đã đăng nhập (staff + viewer)
    execute format('create policy %1$s_sel on %1$s for select using (kbit_role() is not null);', t);
  end loop;
end $$;

-- Ghi (insert/update/delete) cho nhóm giao dịch & đơn hàng: kbit_can_edit()
do $$
declare t text;
begin
  foreach t in array array[
    'customer_orders','customer_order_items','supplier_orders','supplier_order_items',
    'income_transactions','payment_allocations','expense_transactions',
    'internal_receivables','documents','tasks','bank_reconciliations','fx_gain_loss'
  ] loop
    execute format('create policy %1$s_ins on %1$s for insert with check (kbit_can_edit());', t);
    execute format('create policy %1$s_upd on %1$s for update using (kbit_can_edit());', t);
    execute format('create policy %1$s_del on %1$s for delete using (kbit_is_admin());', t);
  end loop;
end $$;

-- Danh mục & cấu hình nhạy cảm: chỉ admin/KTT ghi
do $$
declare t text;
begin
  foreach t in array array[
    'companies','projects','customers','suppliers','bank_accounts','exchange_rates',
    'products','accounting_periods','document_types','operation_library',
    'tax_compliance_calendar','tax_plans','risk_thresholds'
  ] loop
    execute format('create policy %1$s_w on %1$s for all using (kbit_can_approve()) with check (kbit_can_approve());', t);
  end loop;
end $$;

-- users & approval & audit & risk_assessments: chỉ admin/KTT (audit chỉ đọc)
create policy users_w on users for all using (kbit_is_admin()) with check (kbit_is_admin());
create policy approval_w on approval_requests for all using (kbit_can_approve()) with check (kbit_can_approve());
create policy risk_assess_w on risk_assessments for all using (kbit_can_approve()) with check (kbit_can_approve());
create policy oplh_w on operation_library_history for insert with check (kbit_can_approve());  -- ghi lịch sử khi KTT sửa thư viện
-- audit_log: không ai được sửa/xóa (chỉ trigger ghi qua security definer); chỉ đọc đã có policy _sel.

-- ===== ĐIỀU CHỈNH SAU RÀ SOÁT 10 PHASE PLAN (30/05) =====
-- (Các cột bổ sung là nullable/có default nên KHÔNG phá định nghĩa cũ. Phát hiện khi viết plan chi tiết.)
alter table supplier_orders     add column exchange_rate numeric(18,6);                       -- Phase 4/5: đơn NCC ngoại tệ (lưu tỷ giá lúc ghi nợ)
alter table income_transactions add column currency currency_code not null default 'VND';     -- Phase 8: thu đa tệ (công ty KR thu KRW)
alter table income_transactions add column amount_vnd numeric(18,2);                           -- quy đổi VND (với VND: = amount)
alter table income_transactions add column project_id uuid references projects(id);            -- lọc dòng tiền theo dự án
alter table expense_transactions add column project_id uuid references projects(id);           -- lọc dòng tiền theo dự án
-- RLS: sửa đơn = xóa + chèn lại dòng hàng → cho can_edit XÓA dòng hàng (không chỉ admin):
create policy coi_del on customer_order_items for delete using (kbit_can_edit());
create policy soi_del on supplier_order_items for delete using (kbit_can_edit());
-- QUY ƯỚC MIGRATION: đánh số TUẦN TỰ theo thứ tự code thực tế (0001_init, 0002, 0003...),
--   KHÔNG theo số phase. (Các plan phase ghi số minh họa có thể trùng — Sonnet lấy số kế tiếp khi tạo.)

-- =====================================================================
-- HẾT SCHEMA NHÁP 1. Việc cần làm khi chạy:
--  1) Tạo Supabase project (dev), chạy file này trong SQL Editor.
--  2) Tạo vài user thật + gán role để test RLS.
--  3) [⏳] Khi anh chốt 6 câu treo, chỉnh: A2(expense_kind), A3(other_fees),
--     A5(approval 2 cấp), A6(health), A7(tên fulfillment), A8(exchange source).
--  4) [QUYẾT ĐỊNH PHASE 2] bank_accounts.balance: KHÔNG để app ghi trực tiếp
--     (RLS chỉ cho admin/KTT sửa bank_accounts). Cập nhật số dư qua HÀM
--     SECURITY DEFINER khi ghi thu/chi, HOẶC bỏ cột balance và tính số dư
--     bằng VIEW (tổng thu - tổng chi). Khuyến nghị: dùng VIEW (tránh lệch số).
-- =====================================================================
