-- ============ KBIT 0033 — KHO ĐA CÔNG TY ============
-- Mỗi công ty tồn kho + giá vốn riêng. Kho gắn company_id; RPC suy company TỪ KHO
-- nên giữ nguyên chữ ký (caller TS không đổi). Giá vốn BQ + snapshot theo (company, product).
-- Spec: docs/superpowers/specs/2026-06-06-tach-kho-da-cong-ty-design.md
-- Chưa có dữ liệu thật trên cloud → di trú nhẹ (gán kho/snapshot hiện có cho công ty đầu).

-- ── 1) warehouses + company_id; unique đổi (company_id, code) ────────────────────
alter table warehouses add column if not exists company_id uuid references companies(id);
-- Cần ≥1 công ty để gán cho 3 kho seed cũ. Nếu DB chưa có công ty nào (vd migration chạy
-- TRƯỚC seed.sql) → tạo công ty tạm; admin gán lại / xóa kho seed qua trang Quản lý Kho (GĐ B).
insert into companies(code, name, country, base_currency)
  select 'DEFAULT', 'Cong ty mac dinh', 'VN', 'VND'
  where not exists (select 1 from companies);
update warehouses set company_id = (select id from companies order by created_at, code limit 1)
  where company_id is null;
alter table warehouses alter column company_id set not null;
alter table warehouses drop constraint if exists warehouses_code_key;
create unique index if not exists warehouses_company_code_key on warehouses(company_id, code);

-- ── 2) warehouse_transactions + company_id (denormalized từ kho) ─────────────────
alter table warehouse_transactions add column if not exists company_id uuid references companies(id);
update warehouse_transactions wt set company_id = w.company_id
  from warehouses w where w.id = wt.warehouse_id and wt.company_id is null;
create index if not exists idx_wtxn_company_date on warehouse_transactions(company_id, txn_date);

-- ── 3) product_moving_cost: khóa (company_id, product_id). Chưa data thật → tạo lại sạch. ──
drop table if exists product_moving_cost;
create table product_moving_cost (
  company_id  uuid not null references companies(id),
  product_id  uuid not null references products(id),
  qty_on_hand numeric(18,3) not null default 0,
  avg_cost    numeric(18,2) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (company_id, product_id)
);
alter table product_moving_cost enable row level security;
create policy pmc_sel on product_moving_cost for select to authenticated using (true);
create policy pmc_ins on product_moving_cost for insert to authenticated with check (kbit_can_edit());
create policy pmc_upd on product_moving_cost for update to authenticated using (kbit_can_edit());

-- ── 4) inventory_cost_periods: unique (company_id, product_id, period) ───────────
alter table inventory_cost_periods add column if not exists company_id uuid references companies(id);
update inventory_cost_periods set company_id = (select id from companies order by created_at, code limit 1)
  where company_id is null;
alter table inventory_cost_periods drop constraint if exists inventory_cost_periods_product_id_period_key;
create unique index if not exists icp_company_product_period_key
  on inventory_cost_periods(company_id, product_id, period);

-- ── 5) Trigger khóa kỳ KHO: chặn ghi warehouse_transactions vào kỳ công ty đã khóa ──
create or replace function kbit_lock_guard_wtxn()
returns trigger language plpgsql as $$
begin
  perform kbit_assert_period_open(new.company_id, new.txn_date);
  if tg_op = 'UPDATE' then
    perform kbit_assert_period_open(old.company_id, old.txn_date);
  end if;
  return new;
end $$;
drop trigger if exists trg_wtxn_lock on warehouse_transactions;
create trigger trg_wtxn_lock
  before insert or update on warehouse_transactions
  for each row execute function kbit_lock_guard_wtxn();

-- ============ RPC THEO CÔNG TY ============

-- Drop các overload CŨ (signature đổi vì thêm company) để tránh "function is not unique".
drop function if exists kbit_mc_receive(uuid, numeric, numeric);
drop function if exists kbit_mc_issue(uuid, numeric);
drop function if exists kbit_inventory_nxt(text, uuid);
drop function if exists kbit_close_inventory_cost(text);

-- ── 6) Helper mc_* theo (company, product) ──────────────────────────────────────
create or replace function kbit_mc_receive(p_company_id uuid, p_product_id uuid, p_qty numeric, p_unit_cost numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0; v_u numeric; v_newqty numeric; v_newavg numeric;
begin
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost
    where company_id = p_company_id and product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  v_u := coalesce(p_unit_cost, v_avg);
  v_newqty := v_qty + p_qty;
  v_newavg := case when v_qty > 0 then round((v_qty*v_avg + p_qty*v_u)/(v_qty+p_qty), 2) else round(v_u, 2) end;
  insert into product_moving_cost(company_id, product_id, qty_on_hand, avg_cost, updated_at)
    values (p_company_id, p_product_id, v_newqty, v_newavg, now())
  on conflict (company_id, product_id) do update set qty_on_hand = v_newqty, avg_cost = v_newavg, updated_at = now();
  return round(v_u, 2);
end $$;

create or replace function kbit_mc_issue(p_company_id uuid, p_product_id uuid, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0;
begin
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost
    where company_id = p_company_id and product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  insert into product_moving_cost(company_id, product_id, qty_on_hand, avg_cost, updated_at)
    values (p_company_id, p_product_id, v_qty - p_qty, v_avg, now())
  on conflict (company_id, product_id) do update set qty_on_hand = v_qty - p_qty, updated_at = now();
  return round(v_avg, 2);
end $$;

-- ── 7) NHẬP KHO (suy company từ kho) ────────────────────────────────────────────
create or replace function kbit_receive_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_txn_date date,
  p_note text default null, p_created_by uuid default null, p_unit_cost numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_line numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền nhập kho'; end if;
  select company_id into v_company from warehouses where id = p_warehouse_id;
  v_line := kbit_mc_receive(v_company, p_product_id, p_qty, p_unit_cost);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_qty)
  on conflict (warehouse_id, product_id) do update set
    qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at = now();
  insert into warehouse_transactions
    (txn_type, company_id, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost)
  values ('receipt', v_company, p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by, v_line);
end $$;

-- ── 8) XUẤT KHO ─────────────────────────────────────────────────────────────────
create or replace function kbit_issue_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_reason issue_reason,
  p_txn_date date, p_note text default null, p_created_by uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền xuất kho'; end if;
  select company_id into v_company from warehouses where id = p_warehouse_id;
  v_cost := kbit_mc_issue(v_company, p_product_id, p_qty);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, company_id, warehouse_id, product_id, qty, reason, txn_date, note, created_by, unit_cost)
  values ('issue', v_company, p_warehouse_id, p_product_id, p_qty, p_reason, p_txn_date, p_note, p_created_by, v_cost);
end $$;

-- ── 9) XUẤT THEO ĐƠN BÁN ────────────────────────────────────────────────────────
drop function if exists kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid, date);
create or replace function kbit_deduct_order_item(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_order_id uuid,
  p_created_by uuid default null, p_txn_date date default current_date
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền trừ kho'; end if;
  select company_id into v_company from warehouses where id = p_warehouse_id;
  v_cost := kbit_mc_issue(v_company, p_product_id, p_qty);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, company_id, warehouse_id, product_id, qty, txn_date, ref_order_id, created_by, unit_cost)
  values ('order_deduction', v_company, p_warehouse_id, p_product_id, p_qty, p_txn_date, p_order_id, p_created_by, v_cost);
  if p_order_id is not null then
    update customer_order_items set cost_price = v_cost
      where order_id = p_order_id and product_id = p_product_id and cost_price is null;
  end if;
end $$;
grant execute on function kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid, date) to authenticated;

-- ── 10) LUÂN CHUYỂN (chặn chéo công ty) ─────────────────────────────────────────
create or replace function kbit_transfer_stock_full(
  p_from_warehouse uuid, p_to_warehouse uuid, p_product_id uuid, p_qty numeric,
  p_txn_date date, p_note text default null, p_created_by uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_transfer_id uuid := gen_random_uuid(); v_avg numeric := 0; v_company uuid; v_to_company uuid;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền luân chuyển kho'; end if;
  select company_id into v_company    from warehouses where id = p_from_warehouse;
  select company_id into v_to_company from warehouses where id = p_to_warehouse;
  if v_company is distinct from v_to_company then
    raise exception 'LUAN_CHUYEN_KHAC_CTY: Chỉ luân chuyển giữa các kho của CÙNG công ty.';
  end if;
  select coalesce(avg_cost, 0) into v_avg from product_moving_cost
    where company_id = v_company and product_id = p_product_id;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_from_warehouse, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_from_warehouse and product_id = p_product_id;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_to_warehouse, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand + p_qty, updated_at = now()
    where warehouse_id = p_to_warehouse and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, company_id, warehouse_id, to_warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by, unit_cost)
  values ('transfer_out', v_company, p_from_warehouse, p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by, v_avg);
  insert into warehouse_transactions
    (txn_type, company_id, warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by, unit_cost)
  values ('transfer_in', v_company, p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by, v_avg);
  return v_transfer_id;
end $$;

-- ── 11) ĐIỀU CHỈNH (suy company từ kho; ghi sổ adjustment mang dấu) ──────────────
drop function if exists kbit_adjust_stock(uuid, uuid, numeric, numeric);
create or replace function kbit_adjust_stock(
  p_warehouse_id uuid, p_product_id uuid, p_delta numeric,
  p_unit_cost numeric default null, p_txn_date date default current_date,
  p_note text default null, p_created_by uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền chỉnh tồn kho'; end if;
  if p_delta = 0 then return; end if;
  select company_id into v_company from warehouses where id = p_warehouse_id;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand + p_delta, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  if p_delta > 0 then v_cost := kbit_mc_receive(v_company, p_product_id, p_delta, p_unit_cost);
  else                v_cost := kbit_mc_issue(v_company, p_product_id, -p_delta);
  end if;
  insert into warehouse_transactions
    (txn_type, company_id, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost)
  values ('adjustment', v_company, p_warehouse_id, p_product_id, p_delta, p_txn_date,
          coalesce(p_note, 'Điều chỉnh tồn'), p_created_by, v_cost);
end $$;
grant execute on function kbit_adjust_stock(uuid, uuid, numeric, numeric, date, text, uuid) to authenticated;

-- ── 12) SỐ DƯ ĐẦU KỲ (theo công ty của kho) ─────────────────────────────────────
drop function if exists kbit_set_opening_stock(uuid, uuid, text, numeric, numeric);
create or replace function kbit_set_opening_stock(
  p_product_id uuid, p_warehouse_id uuid, p_period text, p_qty numeric, p_unit_cost numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_date date; v_old_qty numeric := 0; v_line numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  select company_id into v_company from warehouses where id = p_warehouse_id;
  v_date := to_date(p_period||'-01','YYYY-MM-DD');
  select coalesce(sum(qty),0) into v_old_qty from warehouse_transactions
    where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
  if v_old_qty <> 0 then
    delete from warehouse_transactions
      where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
    update warehouse_stock set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where warehouse_id=p_warehouse_id and product_id=p_product_id;
    update product_moving_cost set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where company_id=v_company and product_id=p_product_id;
  end if;
  if p_qty > 0 then
    v_line := kbit_mc_receive(v_company, p_product_id, p_qty, p_unit_cost);
    insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
      values (p_warehouse_id, p_product_id, p_qty)
    on conflict (warehouse_id, product_id) do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at=now();
    insert into warehouse_transactions (txn_type, company_id, warehouse_id, product_id, qty, txn_date, note, unit_cost)
      values ('opening', v_company, p_warehouse_id, p_product_id, p_qty, v_date, 'Số dư đầu kỳ', v_line);
  end if;
end $$;
grant execute on function kbit_set_opening_stock(uuid, uuid, text, numeric, numeric) to authenticated;

-- ── 13) BẢNG NXT (thêm p_company_id optional: null = gộp như cũ; có cty = lọc) ──
create or replace function kbit_inventory_nxt(p_period text, p_warehouse_id uuid default null, p_company_id uuid default null)
returns table (
  product_id uuid, code text, name text, unit text,
  qty_open numeric, value_open numeric, qty_in numeric, value_in numeric,
  qty_out numeric, value_out numeric, qty_close numeric, value_close numeric, avg_cost numeric
) language sql stable security definer set search_path = public as $$
  with vstart as (select to_date(p_period||'-01','YYYY-MM-DD') d),
  vend as (select (to_date(p_period||'-01','YYYY-MM-DD') + interval '1 month')::date d),
  base as (
    select wt.product_id, wt.txn_type::text tt, wt.txn_date, wt.qty, coalesce(wt.unit_cost,0) uc
    from warehouse_transactions wt, vend
    where wt.product_id is not null
      and (p_warehouse_id is null or wt.warehouse_id = p_warehouse_id)
      and (p_company_id is null or wt.company_id = p_company_id)
      and wt.txn_date < vend.d
  ),
  agg as (
    select b.product_id,
      sum(case when (b.txn_date < (select d from vstart)
                     or (b.tt='opening' and to_char(b.txn_date,'YYYY-MM')=p_period))
               then (case when b.tt in ('receipt','transfer_in','opening') then b.qty
                          when b.tt in ('issue','order_deduction','transfer_out') then -b.qty
                          when b.tt='adjustment' then b.qty else 0 end) else 0 end) qty_open,
      sum(case when (b.txn_date < (select d from vstart)
                     or (b.tt='opening' and to_char(b.txn_date,'YYYY-MM')=p_period))
               then (case when b.tt in ('receipt','transfer_in','opening') then b.qty*b.uc
                          when b.tt in ('issue','order_deduction','transfer_out') then -b.qty*b.uc
                          when b.tt='adjustment' then b.qty*b.uc else 0 end) else 0 end) value_open,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt='receipt' or (p_warehouse_id is not null and b.tt='transfer_in')
                     or (b.tt='adjustment' and b.qty>0)) then b.qty else 0 end) qty_in,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt='receipt' or (p_warehouse_id is not null and b.tt='transfer_in')
                     or (b.tt='adjustment' and b.qty>0)) then b.qty*b.uc else 0 end) value_in,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt in ('issue','order_deduction') or (p_warehouse_id is not null and b.tt='transfer_out')
                     or (b.tt='adjustment' and b.qty<0))
               then (case when b.tt='adjustment' then -b.qty else b.qty end) else 0 end) qty_out,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt in ('issue','order_deduction') or (p_warehouse_id is not null and b.tt='transfer_out')
                     or (b.tt='adjustment' and b.qty<0))
               then (case when b.tt='adjustment' then -b.qty*b.uc else b.qty*b.uc end) else 0 end) value_out
    from base b group by b.product_id
  )
  select a.product_id, p.code, p.name, p.unit,
    a.qty_open, round(a.value_open,2), a.qty_in, round(a.value_in,2),
    a.qty_out, round(a.value_out,2),
    a.qty_open+a.qty_in-a.qty_out, round(a.value_open+a.value_in-a.value_out,2),
    case when (a.qty_open+a.qty_in-a.qty_out) > 0
         then round((a.value_open+a.value_in-a.value_out)/(a.qty_open+a.qty_in-a.qty_out),2) else 0 end
  from agg a join products p on p.id = a.product_id
  where a.qty_open <> 0 or a.qty_in <> 0 or a.qty_out <> 0 or (a.qty_open+a.qty_in-a.qty_out) <> 0
  order by p.code;
$$;
grant execute on function kbit_inventory_nxt(text, uuid, uuid) to authenticated;

-- ── 14) KHÓA SỔ (theo (company, product); p_company_id optional) ─────────────────
create or replace function kbit_close_inventory_cost(p_period text, p_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_start date; v_end date;
        v_qo numeric; v_vo numeric; v_qi numeric; v_vi numeric; v_qou numeric; v_vou numeric;
        v_qc numeric; v_vc numeric; v_avg numeric;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_start := to_date(p_period||'-01','YYYY-MM-DD');
  v_end   := (v_start + interval '1 month')::date;
  for r in select distinct company_id, product_id from warehouse_transactions
           where product_id is not null and txn_date < v_end
             and (p_company_id is null or company_id = p_company_id) loop
    select
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty
                        when txn_type='adjustment' then qty else 0 end),0),
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty*coalesce(unit_cost,0)
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty*coalesce(unit_cost,0)
                        when txn_type='adjustment' then qty*coalesce(unit_cost,0) else 0 end),0)
      into v_qo, v_vo from warehouse_transactions
      where company_id=r.company_id and product_id=r.product_id
        and (txn_date < v_start or (txn_type='opening' and txn_date >= v_start and txn_date < v_end));
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0) into v_qi, v_vi
      from warehouse_transactions
      where company_id=r.company_id and product_id=r.product_id and txn_date>=v_start and txn_date<v_end
        and (txn_type='receipt' or (txn_type='adjustment' and qty>0));
    select coalesce(sum(case when txn_type='adjustment' then -qty else qty end),0),
           coalesce(sum(case when txn_type='adjustment' then -qty*coalesce(unit_cost,0) else qty*coalesce(unit_cost,0) end),0)
      into v_qou, v_vou from warehouse_transactions
      where company_id=r.company_id and product_id=r.product_id and txn_date>=v_start and txn_date<v_end
        and (txn_type in ('issue','order_deduction') or (txn_type='adjustment' and qty<0));
    v_qc := v_qo + v_qi - v_qou;
    v_vc := round(v_vo + v_vi - v_vou, 2);
    v_avg := case when v_qc > 0 then round(v_vc / v_qc, 2) else 0 end;
    insert into inventory_cost_periods
      (company_id, product_id, period, qty_open, value_open, qty_in, value_in, qty_out, value_out, avg_unit_cost, qty_close, value_close, status, closed_at)
    values
      (r.company_id, r.product_id, p_period, v_qo, round(v_vo,2), v_qi, round(v_vi,2), v_qou, round(v_vou,2), v_avg, v_qc, v_vc, 'closed', now())
    on conflict (company_id, product_id, period) do update set
      qty_open=excluded.qty_open, value_open=excluded.value_open, qty_in=excluded.qty_in, value_in=excluded.value_in,
      qty_out=excluded.qty_out, value_out=excluded.value_out, avg_unit_cost=excluded.avg_unit_cost,
      qty_close=excluded.qty_close, value_close=excluded.value_close, status='closed', closed_at=now();
  end loop;
end $$;
grant execute on function kbit_close_inventory_cost(text, uuid) to authenticated;
