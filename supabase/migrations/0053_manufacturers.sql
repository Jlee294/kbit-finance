-- ============================================================
-- 0053 — Nhà máy sản xuất (manufacturers) + Bảng giá nhà máy
-- ============================================================

-- ── 1) Bảng nhà máy ───────────────────────────────────────────────────────────
create table if not exists manufacturers (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  name       text not null,
  country    text not null default 'KR',
  phone      text,
  email      text,
  address    text,
  note       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table manufacturers enable row level security;

create policy mfr_sel on manufacturers for select to authenticated using (true);
create policy mfr_ins on manufacturers for insert to authenticated with check (kbit_can_edit());
create policy mfr_upd on manufacturers for update to authenticated using (kbit_can_edit());
create policy mfr_del on manufacturers for delete to authenticated using (kbit_role() = 'admin');

-- ── 2) Bảng giá nhà máy (theo sản phẩm × thời điểm) ──────────────────────────
--    Mỗi dòng = 1 sản phẩm × 1 nhà máy × 1 ngày hiệu lực (effective_date).
--    Giá mới → thêm dòng mới với effective_date mới → hệ thống lấy giá gần nhất.
create table if not exists manufacturer_prices (
  id               uuid primary key default gen_random_uuid(),
  manufacturer_id  uuid not null references manufacturers(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  unit_price       numeric(18,4) not null,
  currency         text not null default 'KRW' check (currency in ('VND','KRW','USD')),
  moq              integer,
  effective_date   date not null default current_date,
  includes_bottle  boolean not null default false,
  includes_packaging boolean not null default false,
  note             text,
  created_at       timestamptz not null default now()
);

alter table manufacturer_prices enable row level security;

create policy mp_sel on manufacturer_prices for select to authenticated using (true);
create policy mp_ins on manufacturer_prices for insert to authenticated with check (kbit_can_edit());
create policy mp_upd on manufacturer_prices for update to authenticated using (kbit_can_edit());
create policy mp_del on manufacturer_prices for delete to authenticated using (kbit_can_edit());

create index idx_mp_mfr    on manufacturer_prices(manufacturer_id);
create index idx_mp_prod   on manufacturer_prices(product_id);
create index idx_mp_eff    on manufacturer_prices(manufacturer_id, product_id, effective_date desc);

-- ── 3) Liên kết products → manufacturers ───────────────────────────────────────
alter table products
  add column if not exists manufacturer_id uuid references manufacturers(id);

comment on column products.manufacturer_id is 'Nhà máy SX chính (FK → manufacturers)';
