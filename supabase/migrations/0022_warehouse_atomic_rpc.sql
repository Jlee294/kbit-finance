-- =====================================================================
-- 0022 — Warehouse RPC: atomic stock + ledger + permission check
-- Fixes: non-atomic stock/ledger, missing role check in SECURITY DEFINER
-- =====================================================================

-- ── kbit_adjust_stock: thêm permission check ────────────────────────────
create or replace function kbit_adjust_stock(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_delta        numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền chỉnh tồn kho';
  end if;

  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_delta)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_delta,
      updated_at  = now();
end $$;

-- ── kbit_transfer_stock: thêm permission check ──────────────────────────
create or replace function kbit_transfer_stock(
  p_from_warehouse uuid,
  p_to_warehouse   uuid,
  p_product_id     uuid,
  p_qty            numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền luân chuyển kho';
  end if;

  perform kbit_adjust_stock(p_from_warehouse, p_product_id, -p_qty);
  perform kbit_adjust_stock(p_to_warehouse,   p_product_id, +p_qty);
end $$;

-- ── Atomic nhập kho: stock + ledger trong 1 transaction ──────────────────
create or replace function kbit_receive_stock(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_qty          numeric,
  p_txn_date     date,
  p_note         text default null,
  p_created_by   uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền nhập kho';
  end if;

  -- Điều chỉnh tồn kho
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_qty)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty,
      updated_at  = now();

  -- Ghi sổ cái
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, created_by)
  values
    ('receipt', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by);
end $$;

-- ── Atomic xuất kho: stock + ledger trong 1 transaction ──────────────────
create or replace function kbit_issue_stock(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_qty          numeric,
  p_reason       issue_reason,
  p_txn_date     date,
  p_note         text default null,
  p_created_by   uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền xuất kho';
  end if;

  -- Trừ tồn kho (CHECK constraint bắt âm)
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, -p_qty)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand - p_qty,
      updated_at  = now();

  -- Ghi sổ cái
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, reason, txn_date, note, created_by)
  values
    ('issue', p_warehouse_id, p_product_id, p_qty, p_reason, p_txn_date, p_note, p_created_by);
end $$;

-- ── Atomic luân chuyển: 2 stock updates + 2 ledger entries ───────────────
create or replace function kbit_transfer_stock_full(
  p_from_warehouse uuid,
  p_to_warehouse   uuid,
  p_product_id     uuid,
  p_qty            numeric,
  p_txn_date       date,
  p_note           text default null,
  p_created_by     uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_transfer_id uuid := gen_random_uuid();
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền luân chuyển kho';
  end if;

  -- Trừ kho nguồn
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_from_warehouse, p_product_id, -p_qty)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand - p_qty,
      updated_at  = now();

  -- Cộng kho đích
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_to_warehouse, p_product_id, p_qty)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty,
      updated_at  = now();

  -- Ghi sổ cái: transfer_out
  insert into warehouse_transactions
    (txn_type, warehouse_id, to_warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by)
  values
    ('transfer_out', p_from_warehouse, p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by);

  -- Ghi sổ cái: transfer_in
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by)
  values
    ('transfer_in', p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by);

  return v_transfer_id;
end $$;

-- ── Atomic trừ kho theo đơn hàng: stock + ledger cho 1 item ─────────────
create or replace function kbit_deduct_order_item(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_qty          numeric,
  p_order_id     uuid,
  p_created_by   uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền trừ kho';
  end if;

  -- Trừ tồn kho
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, -p_qty)
  on conflict (warehouse_id, product_id)
    do update set
      qty_on_hand = warehouse_stock.qty_on_hand - p_qty,
      updated_at  = now();

  -- Ghi sổ cái
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, ref_order_id, created_by)
  values
    ('order_deduction', p_warehouse_id, p_product_id, p_qty, current_date, p_order_id, p_created_by);
end $$;
