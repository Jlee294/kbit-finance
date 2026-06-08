-- ============ KBIT 0032 — ĐIỀU CHỈNH KHO (adjustment) MANG DẤU + VÀO BÁO CÁO ============
-- Vá ghi nợ G2 §7.1: dòng sổ 'adjustment' (sinh khi SỬA đơn bán đã trừ kho) trước đây
-- KHÔNG có dấu + không vào NXT/khóa sổ → Tồn cuối báo cáo lệch tồn thực.
-- Vá: adjustment qty MANG DẤU (+ tăng / − giảm); kbit_adjust_stock tự ghi sổ + unit_cost;
--     kbit_inventory_nxt & kbit_close_inventory_cost tính adjustment (+ = Nhập, − = Xuất).

-- ── 1) Cho adjustment mang dấu; mọi loại khác vẫn qty > 0 ───────────────────────
alter table warehouse_transactions drop constraint if exists wtxn_qty_pos;
alter table warehouse_transactions add constraint wtxn_qty_nonzero
  check (qty <> 0 and (txn_type = 'adjustment' or qty > 0));

-- Dọn hàm luân chuyển CŨ (4 tham số, 0012/0022) — không còn caller (app dùng
-- kbit_transfer_stock_full). Sau khi kbit_adjust_stock đổi sang ghi sổ 'adjustment',
-- hàm cũ này nếu còn sẽ vô tình ghi dòng adjustment → drop cho an toàn.
drop function if exists kbit_transfer_stock(uuid, uuid, uuid, numeric);

-- ── 2) kbit_adjust_stock: cập nhật BQ đúng hướng + TỰ ghi sổ 'adjustment' (atomic) ──
--    delta>0 = như nhập (thấm giá p_unit_cost nếu có, NULL→giữ avg); delta<0 = như xuất.
--    Ghi 1 dòng sổ qty = p_delta (mang dấu), unit_cost = giá vốn đã dùng.
drop function if exists kbit_adjust_stock(uuid, uuid, numeric, numeric);
create or replace function kbit_adjust_stock(
  p_warehouse_id uuid, p_product_id uuid, p_delta numeric,
  p_unit_cost numeric default null, p_txn_date date default current_date,
  p_note text default null, p_created_by uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền chỉnh tồn kho'; end if;
  if p_delta = 0 then return; end if;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand + p_delta, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  if p_delta > 0 then v_cost := kbit_mc_receive(p_product_id, p_delta, p_unit_cost);
  else                v_cost := kbit_mc_issue(p_product_id, -p_delta);
  end if;
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost)
  values ('adjustment', p_warehouse_id, p_product_id, p_delta, p_txn_date,
          coalesce(p_note, 'Điều chỉnh tồn'), p_created_by, v_cost);
end $$;
grant execute on function kbit_adjust_stock(uuid, uuid, numeric, numeric, date, text, uuid) to authenticated;

-- ── 3) kbit_inventory_nxt: thêm 'adjustment' (qty dấu) — luôn tính (cả xem tổng lẫn lọc kho) ──
create or replace function kbit_inventory_nxt(p_period text, p_warehouse_id uuid default null)
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
grant execute on function kbit_inventory_nxt(text, uuid) to authenticated;

-- ── 4) kbit_close_inventory_cost: thêm 'adjustment' vào tồn đầu + nhập/xuất khi khóa sổ ──
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
    -- Tồn đầu kỳ (cộng dồn tới trước v_start + opening của chính kỳ; adjustment theo dấu)
    select
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty
                        when txn_type='adjustment' then qty else 0 end),0),
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty*coalesce(unit_cost,0)
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty*coalesce(unit_cost,0)
                        when txn_type='adjustment' then qty*coalesce(unit_cost,0) else 0 end),0)
      into v_qo, v_vo from warehouse_transactions
      where product_id=r.product_id
        and (txn_date < v_start or (txn_type='opening' and txn_date >= v_start and txn_date < v_end));
    -- Nhập trong kỳ: receipt + adjustment dương
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0) into v_qi, v_vi
      from warehouse_transactions
      where product_id=r.product_id and txn_date>=v_start and txn_date<v_end
        and (txn_type='receipt' or (txn_type='adjustment' and qty>0));
    -- Xuất trong kỳ: issue/order_deduction + adjustment âm (lấy trị tuyệt đối)
    select coalesce(sum(case when txn_type='adjustment' then -qty else qty end),0),
           coalesce(sum(case when txn_type='adjustment' then -qty*coalesce(unit_cost,0) else qty*coalesce(unit_cost,0) end),0)
      into v_qou, v_vou from warehouse_transactions
      where product_id=r.product_id and txn_date>=v_start and txn_date<v_end
        and (txn_type in ('issue','order_deduction') or (txn_type='adjustment' and qty<0));
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
