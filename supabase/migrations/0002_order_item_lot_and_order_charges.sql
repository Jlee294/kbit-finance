-- ============================================================
-- Phase 1 patch: per-item lot/exp + order-level charges
-- ============================================================

-- 1. Thêm lot_no + expiry_date vào từng dòng hàng
alter table customer_order_items
  add column if not exists lot_no     text,
  add column if not exists expiry_date date;

-- 2. Chiết khấu / VAT / phí vận chuyển ở cấp đơn hàng
alter table customer_orders
  add column if not exists discount_pct  numeric(5,2) not null default 0,
  add column if not exists vat_pct       numeric(5,2) not null default 0,
  add column if not exists shipping_fee  numeric(18,2) not null default 0;
