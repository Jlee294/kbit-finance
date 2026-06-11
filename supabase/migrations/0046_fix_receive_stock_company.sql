-- =====================================================================
-- 0046 — FIX KTT: migration 0045 dùng SAI signature kbit_mc_receive
-- =====================================================================
-- Lỗi: function kbit_mc_receive(uuid, numeric, numeric) does not exist
--
-- Nguyên nhân:
--   Migration 0030 tạo kbit_mc_receive với 3 tham số (uuid, numeric, numeric).
--   Migration 0033 (kho đa công ty) DROP version cũ → tạo 4 tham số
--      kbit_mc_receive(p_company_id, p_product_id, p_qty, p_unit_cost).
--   Migration 0045 của mình KHÔNG biết đã có 0033 → vẫn gọi 3 tham số.
--   Sau khi paste 0045, kbit_receive_stock bị overwrite bằng version BROKEN.
--
-- Fix: re-create kbit_receive_stock + kbit_set_opening_stock với đúng 4 tham số
--      (suy company_id từ warehouse). Backwards compat: bảo toàn lot+exp của 0045.
-- =====================================================================

-- ── 1) kbit_receive_stock: fix signature kbit_mc_receive (4 tham số) ─────
drop function if exists kbit_receive_stock(uuid, uuid, numeric, date, text, uuid, numeric, text, date);
create or replace function kbit_receive_stock(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_qty          numeric,
  p_txn_date     date,
  p_note         text default null,
  p_created_by   uuid default null,
  p_unit_cost    numeric default null,
  p_lot_no       text default null,
  p_expiry_date  date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_line numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền nhập kho'; end if;
  -- Suy công ty từ kho (mig 0033)
  select company_id into v_company from warehouses where id = p_warehouse_id;
  -- Gọi mc_receive với 4 tham số (mig 0033)
  v_line := kbit_mc_receive(v_company, p_product_id, p_qty, p_unit_cost);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_qty)
  on conflict (warehouse_id, product_id) do update set
    qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at = now();
  insert into warehouse_transactions
    (txn_type, company_id, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost,
     lot_no, expiry_date)
  values
    ('receipt', v_company, p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by, v_line,
     p_lot_no, p_expiry_date);
end $$;
grant execute on function kbit_receive_stock(uuid, uuid, numeric, date, text, uuid, numeric, text, date) to authenticated;

-- ── 2) kbit_set_opening_stock: cũng cần fix (mig 0030 cũng gọi mc_receive 3 tham số) ──
-- Mig 0034 chỉ thêm assert period_open, KHÔNG đổi gọi mc_receive →
-- nếu 0033 đã chạy thì hàm này CŨNG bị broken. Re-create cho chắc.
drop function if exists kbit_set_opening_stock(uuid, uuid, text, numeric, numeric);
create or replace function kbit_set_opening_stock(
  p_product_id uuid, p_warehouse_id uuid, p_period text, p_qty numeric, p_unit_cost numeric
) returns void
language plpgsql security definer set search_path = public as $$
declare v_date date; v_old_qty numeric := 0; v_line numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_date := to_date(p_period||'-01','YYYY-MM-DD');
  select company_id into v_company from warehouses where id = p_warehouse_id;
  -- Vá C1: assert kỳ mở NGAY ĐẦU (chặn cả xóa lẫn ghi đè) — mig 0034
  perform kbit_assert_period_open(v_company, v_date);

  select coalesce(sum(qty),0) into v_old_qty from warehouse_transactions
    where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
  if v_old_qty <> 0 then
    delete from warehouse_transactions
      where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
    update warehouse_stock set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where warehouse_id=p_warehouse_id and product_id=p_product_id;
    update product_moving_cost set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where product_id=p_product_id and company_id=v_company;
  end if;
  if p_qty > 0 then
    -- 4 tham số sau 0033
    v_line := kbit_mc_receive(v_company, p_product_id, p_qty, p_unit_cost);
    insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
      values (p_warehouse_id, p_product_id, p_qty)
    on conflict (warehouse_id, product_id) do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at=now();
    insert into warehouse_transactions
      (txn_type, company_id, warehouse_id, product_id, qty, txn_date, note, unit_cost)
      values ('opening', v_company, p_warehouse_id, p_product_id, p_qty, v_date, 'Số dư đầu kỳ', v_line);
  end if;
end $$;
grant execute on function kbit_set_opening_stock(uuid, uuid, text, numeric, numeric) to authenticated;

-- ── 3) kbit_receive_stock_batch: re-create (chữ ký không đổi nhưng cần re-resolve hàm con) ──
drop function if exists kbit_receive_stock_batch(uuid, jsonb, date, text, uuid);
create or replace function kbit_receive_stock_batch(
  p_warehouse_id uuid,
  p_items        jsonb,
  p_txn_date     date,
  p_note         text default null,
  p_created_by   uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (it->>'product_id') is null then continue; end if;
    perform kbit_receive_stock(
      p_warehouse_id,
      (it->>'product_id')::uuid,
      (it->>'qty')::numeric,
      p_txn_date,
      p_note,
      p_created_by,
      nullif(it->>'unit_cost','')::numeric,
      nullif(it->>'lot_no',''),
      nullif(it->>'expiry_date','')::date
    );
  end loop;
end $$;
grant execute on function kbit_receive_stock_batch(uuid, jsonb, date, text, uuid) to authenticated;
