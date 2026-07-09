-- ============================================================
-- 0054 — Công thức nhà máy (manufacturer_formulas)
-- 1 công thức (VD: Serum B5) → N sản phẩm branded
-- Giá nhà máy gắn theo công thức, sync tất cả SP liên kết.
-- ============================================================

-- ── 1) Bảng công thức nhà máy ─────────────────────────────────────────────────
create table if not exists manufacturer_formulas (
  id              uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references manufacturers(id) on delete cascade,
  code            text not null,
  name            text not null,
  note            text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique(manufacturer_id, code)
);

alter table manufacturer_formulas enable row level security;
create policy mf_sel on manufacturer_formulas for select to authenticated using (true);
create policy mf_ins on manufacturer_formulas for insert to authenticated with check (kbit_can_edit());
create policy mf_upd on manufacturer_formulas for update to authenticated using (kbit_can_edit());
create policy mf_del on manufacturer_formulas for delete to authenticated using (kbit_role() = 'admin');

create index idx_mf_mfr on manufacturer_formulas(manufacturer_id);

-- ── 2) Bảng liên kết công thức → sản phẩm (N:N) ──────────────────────────────
create table if not exists formula_products (
  id         uuid primary key default gen_random_uuid(),
  formula_id uuid not null references manufacturer_formulas(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(formula_id, product_id)
);

alter table formula_products enable row level security;
create policy fp_sel on formula_products for select to authenticated using (true);
create policy fp_ins on formula_products for insert to authenticated with check (kbit_can_edit());
create policy fp_del on formula_products for delete to authenticated using (kbit_can_edit());

create index idx_fp_formula on formula_products(formula_id);
create index idx_fp_product on formula_products(product_id);

-- ── 3) Thêm formula_id vào manufacturer_prices ────────────────────────────────
alter table manufacturer_prices
  add column if not exists formula_id uuid references manufacturer_formulas(id) on delete cascade;

-- ── 4) Migrate dữ liệu cũ: tạo formula cho mỗi product_id đã có ─────────────
do $$
declare
  r record;
  f_id uuid;
begin
  for r in (
    select distinct mp.manufacturer_id, mp.product_id, p.code as p_code, p.name as p_name
    from manufacturer_prices mp
    join products p on p.id = mp.product_id
    where mp.formula_id is null and mp.product_id is not null
  ) loop
    -- Tạo formula từ tên sản phẩm
    insert into manufacturer_formulas (manufacturer_id, code, name)
    values (r.manufacturer_id, r.p_code, r.p_name)
    on conflict (manufacturer_id, code) do update set name = excluded.name
    returning id into f_id;

    -- Link product → formula
    insert into formula_products (formula_id, product_id)
    values (f_id, r.product_id)
    on conflict do nothing;

    -- Gán formula_id cho các dòng giá tương ứng
    update manufacturer_prices
    set formula_id = f_id
    where manufacturer_id = r.manufacturer_id
      and product_id = r.product_id
      and formula_id is null;
  end loop;
end $$;

-- ── 5) Drop product_id (không cần nữa, giá gắn theo formula) ─────────────────
-- Xóa index cũ trước
drop index if exists idx_mp_prod;
drop index if exists idx_mp_eff;

alter table manufacturer_prices drop column if exists product_id;

-- Tạo index mới theo formula
create index idx_mp_formula on manufacturer_prices(formula_id);
create index idx_mp_formula_eff on manufacturer_prices(formula_id, effective_date desc);
