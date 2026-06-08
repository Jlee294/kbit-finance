-- =====================================================================
-- 0025 — Sửa bug XUẤT kho vi phạm CHECK (qty_on_hand >= 0)
-- =====================================================================
-- BỐI CẢNH (bug ở 0012 + 0022):
--   Các hàm xuất/trừ kho dùng pattern
--       insert into warehouse_stock(..., qty_on_hand) values (..., -p_qty)
--       on conflict (...) do update set qty_on_hand = qty_on_hand - p_qty
--   Postgres kiểm CHECK constraint trên DÒNG VALUES (giá trị ÂM, vd -30)
--   TRƯỚC khi xử lý ON CONFLICT. Vì warehouse_stock có
--       constraint warehouse_stock_non_negative check (qty_on_hand >= 0)
--   nên MỌI thao tác xuất kho đều lỗi
--       "violates check constraint warehouse_stock_non_negative"
--   — kể cả khi tồn hiện tại thừa sức (vd tồn 100, xuất 30).
--
-- CÁCH VÁ (an toàn, vẫn chặn tồn âm thật):
--   Tách làm 2 bước — bảo đảm có dòng tồn (insert giá trị 0, ON CONFLICT
--   DO NOTHING) RỒI mới UPDATE cộng/trừ. Khi UPDATE làm tồn xuống âm,
--   CHECK mới chặn → đúng nghiệp vụ (chỉ chặn khi xuất quá tồn).
--
-- PHẠM VI: chỉ create-or-replace 4 hàm dính bug. Giữ NGUYÊN chữ ký,
--   quyền (security definer + kbit_can_edit), và phần ghi
--   warehouse_transactions y như bản gốc 0022. Không đổi schema/CHECK.
--   (kbit_receive_stock cộng kho nên không dính bug; kbit_transfer_stock
--    bản cũ gọi qua kbit_adjust_stock nên tự đúng sau khi vá hàm này.)
-- =====================================================================

-- ── kbit_adjust_stock: điều chỉnh tồn (delta âm = xuất) ──────────────────
create or replace function kbit_adjust_stock(
  p_warehouse_id uuid,
  p_product_id   uuid,
  p_delta        numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then
    raise exception 'Không có quyền chỉnh tồn kho';
  end if;

  -- Bảo đảm có dòng tồn (0) rồi mới cộng/trừ → tránh CHECK bắt VALUES âm.
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update warehouse_stock
    set qty_on_hand = qty_on_hand + p_delta,
        updated_at  = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
end $$;

-- ── kbit_issue_stock: xuất kho (stock + ledger atomic) ───────────────────
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

  -- Trừ tồn kho (CHECK constraint chặn nếu xuất quá tồn)
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update warehouse_stock
    set qty_on_hand = qty_on_hand - p_qty,
        updated_at  = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;

  -- Ghi sổ cái
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, reason, txn_date, note, created_by)
  values
    ('issue', p_warehouse_id, p_product_id, p_qty, p_reason, p_txn_date, p_note, p_created_by);
end $$;

-- ── kbit_deduct_order_item: trừ kho theo đơn hàng (stock + ledger) ───────
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
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update warehouse_stock
    set qty_on_hand = qty_on_hand - p_qty,
        updated_at  = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;

  -- Ghi sổ cái
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, ref_order_id, created_by)
  values
    ('order_deduction', p_warehouse_id, p_product_id, p_qty, current_date, p_order_id, p_created_by);
end $$;

-- ── kbit_transfer_stock_full: luân chuyển (trừ nguồn + cộng đích + 2 ledger) ─
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

  -- Trừ kho nguồn (CHECK chặn nếu nguồn không đủ; cả hàm rollback atomic)
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_from_warehouse, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update warehouse_stock
    set qty_on_hand = qty_on_hand - p_qty,
        updated_at  = now()
    where warehouse_id = p_from_warehouse and product_id = p_product_id;

  -- Cộng kho đích
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_to_warehouse, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;

  update warehouse_stock
    set qty_on_hand = qty_on_hand + p_qty,
        updated_at  = now()
    where warehouse_id = p_to_warehouse and product_id = p_product_id;

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
