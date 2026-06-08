-- KBIT 0031 — Bảng Nhập-Xuất-Tồn theo kỳ (đọc, suy từ sổ cái; khớp giá vốn liên hoàn 0030).
-- p_warehouse_id NULL = tổng mọi kho (BỎ luân chuyển, net 0). Có kho = transfer tính vào Nhập/Xuất kho.
-- Tồn đầu = cộng dồn tới trước period-01 + 'opening' của chính kỳ. Chỉ trả mã có hoạt động/tồn.
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
                          when b.tt in ('issue','order_deduction','transfer_out') then -b.qty else 0 end) else 0 end) qty_open,
      sum(case when (b.txn_date < (select d from vstart)
                     or (b.tt='opening' and to_char(b.txn_date,'YYYY-MM')=p_period))
               then (case when b.tt in ('receipt','transfer_in','opening') then b.qty*b.uc
                          when b.tt in ('issue','order_deduction','transfer_out') then -b.qty*b.uc else 0 end) else 0 end) value_open,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt='receipt' or (p_warehouse_id is not null and b.tt='transfer_in')) then b.qty else 0 end) qty_in,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt='receipt' or (p_warehouse_id is not null and b.tt='transfer_in')) then b.qty*b.uc else 0 end) value_in,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt in ('issue','order_deduction') or (p_warehouse_id is not null and b.tt='transfer_out')) then b.qty else 0 end) qty_out,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt in ('issue','order_deduction') or (p_warehouse_id is not null and b.tt='transfer_out')) then b.qty*b.uc else 0 end) value_out
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
