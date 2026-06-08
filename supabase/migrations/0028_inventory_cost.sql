-- ============ KBIT — GIÁ VỐN BÌNH QUÂN CUỐI KỲ (THÁNG) ============
-- Đợt 1/3 nâng cấp quản trị. Chỉ THÊM mới. Gộp theo product_id (toàn bộ kho). period = 'YYYY-MM'.
-- Spec: docs/superpowers/specs/2026-06-06-gia-von-binh-quan-cuoi-ky-design.md

-- 1) Cột giá vốn trên sổ kho + dòng đơn bán (nullable → an toàn dữ liệu cũ)
alter table warehouse_transactions add column if not exists unit_cost numeric(18,2);
alter table customer_order_items  add column if not exists cost_price numeric(18,2);

-- 2) Thẻ giá vốn tháng (1 dòng / mã / tháng)
create table if not exists inventory_cost_periods (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id),
  period        text not null,                       -- 'YYYY-MM'
  qty_open      numeric(18,3) not null default 0,
  value_open    numeric(18,2) not null default 0,
  qty_in        numeric(18,3) not null default 0,
  value_in      numeric(18,2) not null default 0,
  qty_out       numeric(18,3) not null default 0,
  value_out     numeric(18,2) not null default 0,
  avg_unit_cost numeric(18,2) not null default 0,
  qty_close     numeric(18,3) not null default 0,
  value_close   numeric(18,2) not null default 0,
  status        text not null default 'open',        -- 'open' | 'closed'
  closed_at     timestamptz,
  closed_by     uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (product_id, period)
);
create index if not exists idx_icp_period on inventory_cost_periods(period);

-- 3) RLS: đọc cho mọi user đăng nhập; ghi cho kbit_can_edit()
alter table inventory_cost_periods enable row level security;
create policy icp_sel on inventory_cost_periods for select to authenticated using (true);
create policy icp_ins on inventory_cost_periods for insert to authenticated with check (kbit_can_edit());
create policy icp_upd on inventory_cost_periods for update to authenticated using (kbit_can_edit());

-- 4) Ghi đè kbit_receive_stock: thêm p_unit_cost (drop bản 6-param cũ để tránh trùng hàm).
--    Giữ NGUYÊN logic gốc (0022) — chỉ thêm cột unit_cost vào sổ kho.
drop function if exists kbit_receive_stock(uuid, uuid, numeric, date, text, uuid);
create or replace function kbit_receive_stock(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_qty          numeric,
  p_txn_date     date,
  p_note         text default null,
  p_created_by   uuid default null,
  p_unit_cost    numeric default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền nhập kho';
  end if;

  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_qty)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty,
      updated_at  = now();

  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost)
  values
    ('receipt', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by, p_unit_cost);
end $$;

-- 5) Khai số dư đầu kỳ: ghi qty_open/value_open cho 1 mã ở tháng mốc (chỉ khi thẻ chưa 'closed')
create or replace function kbit_set_opening_stock(
  p_product_id uuid, p_period text, p_qty numeric, p_unit_cost numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  insert into inventory_cost_periods (product_id, period, qty_open, value_open)
  values (p_product_id, p_period, p_qty, round(p_qty * p_unit_cost, 2))
  on conflict (product_id, period) do update
    set qty_open = excluded.qty_open, value_open = excluded.value_open
    where inventory_cost_periods.status = 'open';
end $$;
grant execute on function kbit_set_opening_stock(uuid, text, numeric, numeric) to authenticated;

-- 6) Chốt giá vốn 1 kỳ (tháng): tính BQ từng mã, gán giá vốn xuất + dòng đơn bán, gối đầu sang kỳ sau.
--    NHẬP = warehouse_transactions txn_type 'receipt' (có unit_cost).
--    XUẤT = txn_type 'issue' | 'order_deduction'. Luân chuyển/điều chỉnh CHƯA tính (bản đầu).
--    Lãi gộp: chỉ gán cost_price cho dòng đơn bán (qua order_deduction → ref_order_id).
create or replace function kbit_close_inventory_cost(p_period text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_avail numeric; v_avg numeric; v_value_in numeric; v_qty_in numeric;
        v_qty_out numeric; v_value_out numeric; v_next text;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_next := to_char((to_date(p_period||'-01','YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');

  -- B1: đảm bảo MỌI mã có phát sinh trong kỳ đều có thẻ 'open' (tránh bỏ sót mã chưa khai số dư đầu).
  insert into inventory_cost_periods (product_id, period)
  select distinct wt.product_id, p_period
  from warehouse_transactions wt
  where to_char(wt.txn_date,'YYYY-MM') = p_period
    and wt.txn_type in ('receipt','issue','order_deduction')
    and wt.product_id is not null
  on conflict (product_id, period) do nothing;

  for r in select id, product_id, qty_open, value_open from inventory_cost_periods
           where period = p_period and status = 'open'
  loop
    -- Nhập trong kỳ (gộp mọi kho theo product)
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0)
      into v_qty_in, v_value_in
      from warehouse_transactions
      where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
        and txn_type = 'receipt';
    -- Xuất trong kỳ (bán + hỏng/mẫu)
    select coalesce(sum(qty),0) into v_qty_out
      from warehouse_transactions
      where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
        and txn_type in ('issue','order_deduction');

    v_avail := r.qty_open + v_qty_in;
    v_avg := case when v_avail > 0 then round((r.value_open + v_value_in)/v_avail, 2) else 0 end;
    v_value_out := round(v_qty_out * v_avg, 2);

    update inventory_cost_periods set
      qty_in=v_qty_in, value_in=v_value_in, qty_out=v_qty_out, value_out=v_value_out,
      avg_unit_cost=v_avg, qty_close=r.qty_open+v_qty_in-v_qty_out,
      value_close=round(r.value_open+v_value_in-v_value_out,2),
      status='closed', closed_at=now()
    where id = r.id;

    -- Gán giá vốn cho phiếu xuất trong kỳ
    update warehouse_transactions set unit_cost = v_avg
      where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
        and txn_type in ('issue','order_deduction');

    -- Gán giá vốn dòng đơn bán (qua order_deduction → ref_order_id)
    update customer_order_items coi set cost_price = v_avg
      where coi.product_id = r.product_id and coi.order_id in (
        select distinct ref_order_id from warehouse_transactions
        where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
          and txn_type = 'order_deduction' and ref_order_id is not null);

    -- Gối đầu: tạo thẻ kỳ sau với tồn đầu = tồn cuối
    insert into inventory_cost_periods (product_id, period, qty_open, value_open)
    values (r.product_id, v_next, r.qty_open+v_qty_in-v_qty_out, round(r.value_open+v_value_in-v_value_out,2))
    on conflict (product_id, period) do update
      set qty_open = excluded.qty_open, value_open = excluded.value_open
      where inventory_cost_periods.status = 'open';
  end loop;
end $$;
grant execute on function kbit_close_inventory_cost(text) to authenticated;

-- 7) B2: kbit_deduct_order_item ghi txn_date = order_date (trước đây hardcode current_date → chốt
--    giá vốn lọc nhầm kỳ). Drop bản 5-param cũ, thêm p_txn_date default current_date (caller cũ không vỡ).
drop function if exists kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid);
create or replace function kbit_deduct_order_item(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_qty          numeric,
  p_order_id     uuid,
  p_created_by   uuid default null,
  p_txn_date     date default current_date
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền trừ kho';
  end if;

  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update warehouse_stock
    set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;

  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, ref_order_id, created_by)
  values
    ('order_deduction', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_order_id, p_created_by);
end $$;
grant execute on function kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid, date) to authenticated;
