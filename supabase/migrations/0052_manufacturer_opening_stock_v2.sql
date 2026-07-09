-- ============================================================
-- 0052 — Nhà máy SX (manufacturer) + nâng cấp Opening Stock v2
-- Thêm manufacturer vào products, production_date vào warehouse_transactions,
-- và mở rộng kbit_set_opening_stock để nhận lot_no, production_date, expiry_date.
-- ============================================================

-- ── 1) products: + manufacturer ────────────────────────────────────────────────
alter table products
  add column if not exists manufacturer text;

comment on column products.manufacturer is 'Nhà máy sản xuất (VD: Cosmax, Kolmar, CJBIO)';

-- ── 2) warehouse_transactions: + production_date ───────────────────────────────
alter table warehouse_transactions
  add column if not exists production_date date;

comment on column warehouse_transactions.production_date is 'Ngày sản xuất (gắn với lô hàng)';

-- ── 3) Nâng cấp kbit_set_opening_stock → v2 (thêm lot, ngày SX, HSD) ─────────
--    Giữ nguyên bản cũ (5 params) cho backward compat.
--    Bản mới nhận thêm lot_no, production_date, expiry_date.
create or replace function kbit_set_opening_stock_v2(
  p_product_id      uuid,
  p_warehouse_id    uuid,
  p_period          text,
  p_qty             numeric,
  p_unit_cost       numeric,
  p_lot_no          text          default null,
  p_production_date date          default null,
  p_expiry_date     date          default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_date    date;
  v_old_qty numeric := 0;
  v_line    numeric;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;

  v_date := to_date(p_period || '-01', 'YYYY-MM-DD');

  -- Xóa opening cũ cho product+warehouse+period (ghi đè)
  select coalesce(sum(qty), 0) into v_old_qty
    from warehouse_transactions
    where product_id = p_product_id
      and warehouse_id = p_warehouse_id
      and txn_type = 'opening'
      and txn_date = v_date;

  if v_old_qty <> 0 then
    delete from warehouse_transactions
      where product_id = p_product_id
        and warehouse_id = p_warehouse_id
        and txn_type = 'opening'
        and txn_date = v_date;

    update warehouse_stock
      set qty_on_hand = qty_on_hand - v_old_qty, updated_at = now()
      where warehouse_id = p_warehouse_id and product_id = p_product_id;

    update product_moving_cost
      set qty_on_hand = qty_on_hand - v_old_qty, updated_at = now()
      where product_id = p_product_id;
  end if;

  if p_qty > 0 then
    v_line := kbit_mc_receive(p_product_id, p_qty, p_unit_cost);

    insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
      values (p_warehouse_id, p_product_id, p_qty)
    on conflict (warehouse_id, product_id) do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at = now();

    insert into warehouse_transactions
      (txn_type, warehouse_id, product_id, qty, txn_date, note, unit_cost,
       lot_no, production_date, expiry_date)
    values
      ('opening', p_warehouse_id, p_product_id, p_qty, v_date,
       'Số dư đầu kỳ', v_line,
       p_lot_no, p_production_date, p_expiry_date);
  end if;
end $$;

grant execute on function kbit_set_opening_stock_v2(uuid, uuid, text, numeric, numeric, text, date, date)
  to authenticated;
