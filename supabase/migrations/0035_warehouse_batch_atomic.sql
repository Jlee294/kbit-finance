-- =====================================================================
-- 0035 — VÁ edge C-3.3: ghi kho NHIỀU DÒNG trong 1 GIAO DỊCH (nguyên tử).
-- Trước đây import/đơn bán gọi kbit_receive_stock / kbit_deduct_order_item theo
-- VÒNG LẶP ở tầng app — mỗi RPC tự commit. Nếu 1 dòng GIỮA chừng lỗi (vd kỳ khóa,
-- mã hàng sai) thì các dòng trước đã ghi kho KHÔNG được hoàn → tồn/giá vốn lệch.
-- Hàm plpgsql chạy trong 1 transaction: chỉ cần 1 dòng raise là TOÀN BỘ rollback
-- → "ăn cả hoặc hủy hết". App chỉ gọi 1 lần, không cần rollback tay phần kho nữa.
-- p_items: jsonb mảng [{product_id, qty, unit_cost?}] (unit_cost chỉ dùng cho nhập).
-- =====================================================================

-- Nhập kho nhiều dòng (mỗi dòng có thể đơn giá vốn riêng — phân bổ nhập khẩu/hóa đơn)
create or replace function kbit_receive_stock_batch(
  p_warehouse_id uuid, p_items jsonb, p_txn_date date,
  p_note text default null, p_created_by uuid default null
) returns void language plpgsql security definer set search_path = public as $$
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
      nullif(it->>'unit_cost','')::numeric
    );
  end loop;
end $$;
grant execute on function kbit_receive_stock_batch(uuid, jsonb, date, text, uuid) to authenticated;

-- Trừ kho theo đơn nhiều dòng (giá vốn xuất = bình quân hiện hành, ghi cost_price)
create or replace function kbit_deduct_order_batch(
  p_warehouse_id uuid, p_order_id uuid, p_items jsonb,
  p_created_by uuid default null, p_txn_date date default current_date
) returns void language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  for it in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (it->>'product_id') is null then continue; end if;
    perform kbit_deduct_order_item(
      p_warehouse_id,
      (it->>'product_id')::uuid,
      (it->>'qty')::numeric,
      p_order_id,
      p_created_by,
      p_txn_date
    );
  end loop;
end $$;
grant execute on function kbit_deduct_order_batch(uuid, uuid, jsonb, uuid, date) to authenticated;
