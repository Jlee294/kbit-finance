-- =====================================================================
-- KBIT — MODULE KHO HÀNG
-- 0012_warehouses.sql
-- =====================================================================

-- ── Enums ─────────────────────────────────────────────────────────────
create type warehouse_txn_type as enum (
  'receipt',         -- nhập kho
  'issue',           -- xuất kho
  'transfer_out',    -- luân chuyển ra
  'transfer_in',     -- luân chuyển vào
  'order_deduction', -- trừ kho theo đơn hàng
  'adjustment'       -- điều chỉnh tồn kho
);

create type issue_reason as enum (
  'sale',       -- bán hàng
  'damage',     -- hỏng hóc
  'sample',     -- hàng mẫu
  'other'       -- lý do khác
);

-- ── Bảng kho ──────────────────────────────────────────────────────────
create table warehouses (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed 3 kho mặc định
insert into warehouses (code, name) values
  ('KHO-VN', 'Kho VN'),
  ('KHO-KR', 'Kho KR'),
  ('KHO-BB', 'Kho Bao bì');

-- ── Tồn kho hiện tại (denormalized, cập nhật mỗi lần phát sinh) ────────
create table warehouse_stock (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouses(id),
  product_id   uuid not null references products(id),
  qty_on_hand  numeric(18,3) not null default 0
    constraint warehouse_stock_non_negative check (qty_on_hand >= 0),
  updated_at   timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

-- ── Sổ cái xuất nhập (append-only) ────────────────────────────────────
create table warehouse_transactions (
  id                 uuid primary key default gen_random_uuid(),
  txn_date           date not null default current_date,
  txn_type           warehouse_txn_type not null,
  warehouse_id       uuid not null references warehouses(id),
  product_id         uuid not null references products(id),
  qty                numeric(18,3) not null constraint wtxn_qty_pos check (qty > 0),
  reason             issue_reason,
  note               text,
  ref_order_id       uuid references customer_orders(id),
  ref_transfer_id    uuid,          -- UUID dùng chung để ghép transfer_out <-> transfer_in
  to_warehouse_id    uuid references warehouses(id),  -- chỉ cho transfer_out
  created_by         uuid references users(id),
  created_at         timestamptz not null default now()
);

create index idx_wtxn_warehouse on warehouse_transactions(warehouse_id, txn_date desc);
create index idx_wtxn_product   on warehouse_transactions(product_id);
create index idx_wtxn_order     on warehouse_transactions(ref_order_id) where ref_order_id is not null;

-- ── Thêm cột vào customer_orders ──────────────────────────────────────
alter table customer_orders
  add column if not exists warehouse_id    uuid references warehouses(id),
  add column if not exists stock_deducted  boolean not null default false;

-- ── Hàm điều chỉnh tồn kho (atomic upsert) ────────────────────────────
-- delta > 0 = nhập; delta < 0 = xuất (CHECK trên bảng bắt âm tồn)
create or replace function kbit_adjust_stock(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_delta        numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_delta)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_delta,
      updated_at  = now();
end $$;

-- Hàm luân chuyển atomic (cả 2 kho trong 1 transaction DB)
create or replace function kbit_transfer_stock(
  p_from_warehouse uuid,
  p_to_warehouse   uuid,
  p_product_id     uuid,
  p_qty            numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- Trừ kho nguồn trước — CHECK constraint sẽ raise nếu không đủ tồn
  perform kbit_adjust_stock(p_from_warehouse, p_product_id, -p_qty);
  -- Cộng kho đích
  perform kbit_adjust_stock(p_to_warehouse,   p_product_id, +p_qty);
end $$;

-- ── Trigger updated_at ─────────────────────────────────────────────────
create trigger trg_warehouses_updated
  before update on warehouses
  for each row execute function set_updated_at();

create trigger trg_wstock_updated
  before update on warehouse_stock
  for each row execute function set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────
alter table warehouses           enable row level security;
alter table warehouse_stock      enable row level security;
alter table warehouse_transactions enable row level security;

-- Đọc: mọi staff + viewer
create policy warehouses_sel    on warehouses            for select using (kbit_role() is not null);
create policy wstock_sel        on warehouse_stock       for select using (kbit_role() is not null);
create policy wtxn_sel          on warehouse_transactions for select using (kbit_role() is not null);

-- Ghi warehouses: admin/KTT
create policy warehouses_w      on warehouses
  for all using (kbit_can_approve()) with check (kbit_can_approve());

-- warehouse_stock: chỉ ghi qua hàm security definer (không cần direct INSERT policy)
-- Nhưng hàm kbit_adjust_stock cần quyền INSERT/UPDATE → grant cho service_role đã đủ
-- Direct insert từ app cần: (dùng cho upsert trong hàm kbit_adjust_stock đã là security definer)

-- warehouse_transactions: staff có thể insert (nhập/xuất/luân chuyển)
create policy wtxn_ins          on warehouse_transactions for insert with check (kbit_can_edit());
-- Không ai được UPDATE hoặc DELETE (append-only)
