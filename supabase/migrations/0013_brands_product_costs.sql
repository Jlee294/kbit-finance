-- ============================================================
-- 0013 — Brands + product cost fields
-- Chạy 1 lần trong Supabase SQL Editor
-- ============================================================

-- ── 1. Bảng thương hiệu (brands) ─────────────────────────────────────────────
create table if not exists brands (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table brands enable row level security;

create policy "viewer_select_brands" on brands
  for select using (kbit_role() in ('admin','chief_accountant','accountant','viewer'));

create policy "editor_insert_brands" on brands
  for insert with check (kbit_can_edit());

create policy "editor_update_brands" on brands
  for update using (kbit_can_edit());

create policy "admin_delete_brands" on brands
  for delete using (kbit_role() = 'admin');

-- ── 2. Hỗ trợ USD trong exchange_rates ───────────────────────────────────────
do $$ begin
  alter type currency_code add value if not exists 'USD';
exception when others then null;
end $$;

-- ── 3. Thêm cột chi phí + brand vào products ─────────────────────────────────
alter table products
  add column if not exists brand_id            uuid references brands(id),
  add column if not exists cost_material       numeric(18,4),
  add column if not exists cost_material_curr  text not null default 'KRW'
    check (cost_material_curr  in ('VND','KRW','USD')),
  add column if not exists cost_bottle         numeric(18,4),
  add column if not exists cost_bottle_curr    text not null default 'KRW'
    check (cost_bottle_curr    in ('VND','KRW','USD')),
  add column if not exists cost_packaging      numeric(18,4),
  add column if not exists cost_packaging_curr text not null default 'KRW'
    check (cost_packaging_curr in ('VND','KRW','USD')),
  add column if not exists cost_shipping       numeric(18,4),
  add column if not exists cost_shipping_curr  text not null default 'KRW'
    check (cost_shipping_curr  in ('VND','KRW','USD')),
  add column if not exists price_list_kr       numeric(18,4),   -- Giá niêm yết KR (KRW)
  add column if not exists price_list_vn       numeric(18,4);   -- Giá niêm yết VN (VND)
