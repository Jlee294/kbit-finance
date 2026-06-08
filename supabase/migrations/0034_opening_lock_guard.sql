-- =====================================================================
-- 0034 — VÁ C1: set_opening_stock phải chặn kỳ ĐÃ KHÓA cả ở đường XÓA.
-- Trigger trg_wtxn_lock chỉ bắt INSERT/UPDATE, không bắt DELETE. Khi gọi
-- kbit_set_opening_stock với p_qty=0, hàm chỉ DELETE dòng 'opening' cũ mà
-- không INSERT → trigger không kích hoạt → xóa lén được số dư kỳ đã khóa.
-- Sửa gốc: assert kỳ mở NGAY ĐẦU hàm (chặn cả xóa lẫn ghi đè trong kỳ khóa).
-- =====================================================================
create or replace function kbit_set_opening_stock(
  p_product_id uuid, p_warehouse_id uuid, p_period text, p_qty numeric, p_unit_cost numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_date date; v_old_qty numeric := 0; v_line numeric; v_company uuid;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  select company_id into v_company from warehouses where id = p_warehouse_id;
  v_date := to_date(p_period||'-01','YYYY-MM-DD');
  perform kbit_assert_period_open(v_company, v_date);   -- C1: chặn mọi thao tác (kể cả xóa qty=0) khi kỳ đã khóa
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
