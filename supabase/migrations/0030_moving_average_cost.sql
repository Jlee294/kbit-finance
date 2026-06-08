-- ============ KBIT 0030 — GIÁ VỐN BÌNH QUÂN LIÊN HOÀN (moving average) ============
-- Đổi toàn hệ thống từ BQ cuối kỳ (0028) sang LIÊN HOÀN. Chưa có data thật → thay thẳng.
-- Đơn giá BQ theo MÃ (gộp mọi kho); số lượng quản lý theo KHO.
-- Sổ cái warehouse_transactions = nguồn sự thật (gồm 'opening'); product_moving_cost = cache giá BQ hiện hành.
-- Spec: docs/superpowers/specs/2026-06-06-gia-von-lien-hoan-va-bang-nxt-design.md

-- ── 1) Cache giá vốn BQ liên hoàn hiện hành (theo MÃ, gộp mọi kho) ──────────────
create table if not exists product_moving_cost (
  product_id  uuid primary key references products(id),
  qty_on_hand numeric(18,3) not null default 0,
  avg_cost    numeric(18,2) not null default 0,
  updated_at  timestamptz not null default now()
);
alter table product_moving_cost enable row level security;
create policy pmc_sel on product_moving_cost for select to authenticated using (true);
create policy pmc_ins on product_moving_cost for insert to authenticated with check (kbit_can_edit());
create policy pmc_upd on product_moving_cost for update to authenticated using (kbit_can_edit());

-- ── 2) Helper NHẬP: cập nhật BQ liên hoàn; trả về đơn giá ghi sổ. ───────────────
--    unit_cost NULL → dùng avg hiện hành. Tồn ≤ 0 → lấy giá lô mới.
create or replace function kbit_mc_receive(p_product_id uuid, p_qty numeric, p_unit_cost numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0; v_u numeric; v_newqty numeric; v_newavg numeric;
begin
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost where product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  v_u := coalesce(p_unit_cost, v_avg);
  v_newqty := v_qty + p_qty;
  v_newavg := case when v_qty > 0 then round((v_qty*v_avg + p_qty*v_u)/(v_qty+p_qty), 2) else round(v_u, 2) end;
  insert into product_moving_cost(product_id, qty_on_hand, avg_cost, updated_at)
    values (p_product_id, v_newqty, v_newavg, now())
  on conflict (product_id) do update set qty_on_hand = v_newqty, avg_cost = v_newavg, updated_at = now();
  return round(v_u, 2);
end $$;

-- ── 3) Helper XUẤT: trả về giá vốn (avg hiện hành). avg KHÔNG đổi. ──────────────
create or replace function kbit_mc_issue(p_product_id uuid, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0;
begin
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost where product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  insert into product_moving_cost(product_id, qty_on_hand, avg_cost, updated_at)
    values (p_product_id, v_qty - p_qty, v_avg, now())
  on conflict (product_id) do update set qty_on_hand = v_qty - p_qty, updated_at = now();
  return round(v_avg, 2);
end $$;

-- ── 4) NHẬP KHO ────────────────────────────────────────────────────────────────
drop function if exists kbit_receive_stock(uuid, uuid, numeric, date, text, uuid, numeric);
create or replace function kbit_receive_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_txn_date date,
  p_note text default null, p_created_by uuid default null, p_unit_cost numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_line numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền nhập kho'; end if;
  v_line := kbit_mc_receive(p_product_id, p_qty, p_unit_cost);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_qty)
  on conflict (warehouse_id, product_id) do update set
    qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at = now();
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost)
  values ('receipt', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by, v_line);
end $$;

-- ── 5) XUẤT KHO ────────────────────────────────────────────────────────────────
create or replace function kbit_issue_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_reason issue_reason,
  p_txn_date date, p_note text default null, p_created_by uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền xuất kho'; end if;
  v_cost := kbit_mc_issue(p_product_id, p_qty);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, reason, txn_date, note, created_by, unit_cost)
  values ('issue', p_warehouse_id, p_product_id, p_qty, p_reason, p_txn_date, p_note, p_created_by, v_cost);
end $$;

-- ── 6) XUẤT THEO ĐƠN BÁN: giá vốn realtime + gán cost_price ngay ────────────────
drop function if exists kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid, date);
create or replace function kbit_deduct_order_item(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_order_id uuid,
  p_created_by uuid default null, p_txn_date date default current_date
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền trừ kho'; end if;
  v_cost := kbit_mc_issue(p_product_id, p_qty);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, ref_order_id, created_by, unit_cost)
  values ('order_deduction', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_order_id, p_created_by, v_cost);
  if p_order_id is not null then
    update customer_order_items set cost_price = v_cost
      where order_id = p_order_id and product_id = p_product_id and cost_price is null;
  end if;
end $$;
grant execute on function kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid, date) to authenticated;

-- ── 7) LUÂN CHUYỂN: tổng tồn mã không đổi → cache giữ nguyên; ghi 2 dòng unit_cost = avg ──
create or replace function kbit_transfer_stock_full(
  p_from_warehouse uuid, p_to_warehouse uuid, p_product_id uuid, p_qty numeric,
  p_txn_date date, p_note text default null, p_created_by uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_transfer_id uuid := gen_random_uuid(); v_avg numeric := 0;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền luân chuyển kho'; end if;
  select coalesce(avg_cost, 0) into v_avg from product_moving_cost where product_id = p_product_id;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_from_warehouse, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_from_warehouse and product_id = p_product_id;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_to_warehouse, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand + p_qty, updated_at = now()
    where warehouse_id = p_to_warehouse and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, warehouse_id, to_warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by, unit_cost)
  values ('transfer_out', p_from_warehouse, p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by, v_avg);
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by, unit_cost)
  values ('transfer_in', p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by, v_avg);
  return v_transfer_id;
end $$;

-- ── 8) ĐIỀU CHỈNH: đổi tồn 1 kho + cập nhật BQ liên hoàn ĐÚNG HƯỚNG. ──────────────
--    Tăng tồn (delta>0) = như NHẬP (thấm giá p_unit_cost nếu có; NULL → giữ avg hiện hành).
--    Giảm tồn (delta<0) = như XUẤT (giữ avg). Drop bản 3-tham số cũ để mọi caller dùng bản mới.
drop function if exists kbit_adjust_stock(uuid, uuid, numeric);
create or replace function kbit_adjust_stock(
  p_warehouse_id uuid, p_product_id uuid, p_delta numeric, p_unit_cost numeric default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then raise exception 'Không có quyền chỉnh tồn kho'; end if;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand + p_delta, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  if p_delta > 0 then
    perform kbit_mc_receive(p_product_id, p_delta, p_unit_cost);
  elsif p_delta < 0 then
    perform kbit_mc_issue(p_product_id, -p_delta);
  end if;
end $$;
grant execute on function kbit_adjust_stock(uuid, uuid, numeric, numeric) to authenticated;

-- ── 9) SỐ DƯ ĐẦU KỲ theo KHO: ghi/ghi đè 1 dòng 'opening' + đặt tồn kho + cập nhật cache ──
drop function if exists kbit_set_opening_stock(uuid, text, numeric, numeric);
create or replace function kbit_set_opening_stock(
  p_product_id uuid, p_warehouse_id uuid, p_period text, p_qty numeric, p_unit_cost numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_date date; v_old_qty numeric := 0; v_line numeric;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_date := to_date(p_period||'-01','YYYY-MM-DD');
  select coalesce(sum(qty),0) into v_old_qty from warehouse_transactions
    where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
  if v_old_qty <> 0 then
    delete from warehouse_transactions
      where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
    update warehouse_stock set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where warehouse_id=p_warehouse_id and product_id=p_product_id;
    update product_moving_cost set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where product_id=p_product_id;
  end if;
  if p_qty > 0 then
    v_line := kbit_mc_receive(p_product_id, p_qty, p_unit_cost);
    insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
      values (p_warehouse_id, p_product_id, p_qty)
    on conflict (warehouse_id, product_id) do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at=now();
    insert into warehouse_transactions (txn_type, warehouse_id, product_id, qty, txn_date, note, unit_cost)
      values ('opening', p_warehouse_id, p_product_id, p_qty, v_date, 'Số dư đầu kỳ', v_line);
  end if;
end $$;
grant execute on function kbit_set_opening_stock(uuid, uuid, text, numeric, numeric) to authenticated;

-- ── 10) CHỐT KỲ = KHÓA SỔ: snapshot cộng dồn từ sổ (KHÔNG tính lại giá). ──────────
--    Bảo toàn: value_open + value_in = value_out + value_close (§4.2.bis).
create or replace function kbit_close_inventory_cost(p_period text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_start date; v_end date;
        v_qo numeric; v_vo numeric; v_qi numeric; v_vi numeric; v_qou numeric; v_vou numeric;
        v_qc numeric; v_vc numeric; v_avg numeric;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_start := to_date(p_period||'-01','YYYY-MM-DD');
  v_end   := (v_start + interval '1 month')::date;
  for r in select distinct product_id from warehouse_transactions
           where product_id is not null and txn_date < v_end loop
    select
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty else 0 end),0),
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty*coalesce(unit_cost,0)
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty*coalesce(unit_cost,0) else 0 end),0)
      into v_qo, v_vo from warehouse_transactions
      where product_id=r.product_id
        and (txn_date < v_start
             or (txn_type = 'opening' and txn_date >= v_start and txn_date < v_end));
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0) into v_qi, v_vi
      from warehouse_transactions
      where product_id=r.product_id and txn_date>=v_start and txn_date<v_end and txn_type='receipt';
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0) into v_qou, v_vou
      from warehouse_transactions
      where product_id=r.product_id and txn_date>=v_start and txn_date<v_end and txn_type in ('issue','order_deduction');
    v_qc := v_qo + v_qi - v_qou;
    v_vc := round(v_vo + v_vi - v_vou, 2);
    v_avg := case when v_qc > 0 then round(v_vc / v_qc, 2) else 0 end;
    insert into inventory_cost_periods
      (product_id, period, qty_open, value_open, qty_in, value_in, qty_out, value_out, avg_unit_cost, qty_close, value_close, status, closed_at)
    values
      (r.product_id, p_period, v_qo, round(v_vo,2), v_qi, round(v_vi,2), v_qou, round(v_vou,2), v_avg, v_qc, v_vc, 'closed', now())
    on conflict (product_id, period) do update set
      qty_open=excluded.qty_open, value_open=excluded.value_open, qty_in=excluded.qty_in, value_in=excluded.value_in,
      qty_out=excluded.qty_out, value_out=excluded.value_out, avg_unit_cost=excluded.avg_unit_cost,
      qty_close=excluded.qty_close, value_close=excluded.value_close, status='closed', closed_at=now();
  end loop;
end $$;
grant execute on function kbit_close_inventory_cost(text) to authenticated;
