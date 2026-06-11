-- =====================================================================
-- 0045 — KTT G: Số lô + HSD cho hàng nhập kho
-- =====================================================================
-- KTT: 'khi nhập kho là có nhập cả số Lô và Exp'
--
-- Schema hiện có:
--   • customer_order_items.lot_no + expiry_date (đã có từ mig 0002)
--     → chọn lô khi BÁN
--   • supplier_order_items: CHƯA có → THÊM ở migration này
--   • warehouse_transactions: CHƯA có → THÊM (sổ cái có lot+exp)
--
-- Workflow:
--   1. Nhập đơn mua/nhập khẩu → mỗi dòng có lot_no + expiry_date
--   2. kbit_receive_stock(_batch) ghi cùng lúc vào warehouse_transactions
--   3. Chatbot/báo cáo query warehouse_transactions group by product+lot
--      → tồn kho theo lô, HSD per lô
-- =====================================================================

-- ── 1) supplier_order_items: + lot_no, expiry_date ──────────────────────
alter table supplier_order_items
  add column if not exists lot_no      text,
  add column if not exists expiry_date date;

comment on column supplier_order_items.lot_no      is 'KTT G: số lô khi nhập';
comment on column supplier_order_items.expiry_date is 'KTT G: hạn sử dụng lô';

-- ── 2) warehouse_transactions: + lot_no, expiry_date ────────────────────
-- Sổ cái mang dấu lô + HSD để tổng hợp tồn theo lô + báo cáo sắp hết HSD.
alter table warehouse_transactions
  add column if not exists lot_no      text,
  add column if not exists expiry_date date;

comment on column warehouse_transactions.lot_no      is 'KTT G: số lô (gắn với dòng nhập)';
comment on column warehouse_transactions.expiry_date is 'KTT G: HSD lô — query items sắp hết hạn';

-- Partial index cho query 'sắp hết HSD' (cập nhật chỉ trên các dòng có exp)
create index if not exists idx_wtxn_expiry_date
  on warehouse_transactions(expiry_date)
  where expiry_date is not null;

create index if not exists idx_wtxn_product_lot
  on warehouse_transactions(product_id, lot_no)
  where lot_no is not null;

-- ── 3) kbit_receive_stock: thêm p_lot_no + p_expiry_date ────────────────
-- Đổi chữ ký → DROP rồi CREATE lại (giữ default → backward compat caller cũ).
drop function if exists kbit_receive_stock(uuid, uuid, numeric, date, text, uuid, numeric);
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
declare v_line numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền nhập kho'; end if;
  v_line := kbit_mc_receive(p_product_id, p_qty, p_unit_cost);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_qty)
  on conflict (warehouse_id, product_id) do update set
    qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at = now();
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost,
     lot_no, expiry_date)
  values
    ('receipt', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by, v_line,
     p_lot_no, p_expiry_date);
end $$;
grant execute on function kbit_receive_stock(uuid, uuid, numeric, date, text, uuid, numeric, text, date) to authenticated;

-- ── 4) kbit_receive_stock_batch: pass lot_no + expiry_date từ JSON ──────
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

-- ── 5) View tiện ích: tồn kho theo lô + HSD ─────────────────────────────
-- Cộng/trừ qty theo product_id + lot_no, lọc dòng có lot.
-- Dùng cho chatbot + báo cáo 'sắp hết HSD'.
create or replace view kbit_stock_by_lot as
select
  wt.product_id,
  wt.lot_no,
  wt.expiry_date,
  wt.warehouse_id,
  sum(case when wt.txn_type in ('receipt','transfer_in','opening')
           then wt.qty
           when wt.txn_type = 'adjustment'
           then wt.qty                                   -- adjustment đã mang dấu (mig 0032)
           else -wt.qty
      end) as qty_on_hand
from warehouse_transactions wt
where wt.lot_no is not null
group by wt.product_id, wt.lot_no, wt.expiry_date, wt.warehouse_id
having sum(case when wt.txn_type in ('receipt','transfer_in','opening')
                then wt.qty
                when wt.txn_type = 'adjustment'
                then wt.qty
                else -wt.qty
           end) > 0;

comment on view kbit_stock_by_lot is
  'KTT G: tồn kho theo lô + HSD. Chỉ dòng có lot_no và qty còn dương. Dùng cho chatbot và báo cáo HSD.';
