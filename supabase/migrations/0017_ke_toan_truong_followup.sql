-- ============================================================
-- 0017 — Bổ sung theo phản hồi Kế toán trưởng (vòng 2)
--   • Nhân sự thực hiện (người thực hiện nghiệp vụ)
--   • Thu hộ / Chi hộ trên các bảng tiền
--   • Warehouse + stock_added cho supplier_orders (auto nhập kho)
-- ============================================================

-- ── 1. Nhân sự thực hiện — gắn lên các bảng giao dịch chính ──────────────────
-- created_by = người NHẬP liệu. nhan_su_thuc_hien = người THỰC HIỆN nghiệp vụ
-- (ví dụ: bạn Linh đi giao hàng → nhập đơn cho khách, Linh là nhân sự thực hiện)

alter table customer_orders
  add column if not exists nhan_su_thuc_hien uuid references users(id);
alter table supplier_orders
  add column if not exists nhan_su_thuc_hien uuid references users(id);
alter table income_transactions
  add column if not exists nhan_su_thuc_hien uuid references users(id);
alter table expense_transactions
  add column if not exists nhan_su_thuc_hien uuid references users(id);
alter table cash_book
  add column if not exists nhan_su_thuc_hien uuid references users(id);

-- ── 2. Thu hộ trên income_transactions ───────────────────────────────────────
-- expense_transactions đã có is_chi_ho + chi_ho_person (chi hộ KH/NCC)
-- bổ sung đối ứng: thu hộ — khi 1 ai đó thu tiền hộ công ty
alter table income_transactions
  add column if not exists is_thu_ho     boolean not null default false,
  add column if not exists thu_ho_person text;

-- ── 3. Thu hộ / Chi hộ trên cash_book ───────────────────────────────────────
alter table cash_book
  add column if not exists is_chi_ho     boolean not null default false,
  add column if not exists chi_ho_person text,
  add column if not exists is_thu_ho     boolean not null default false,
  add column if not exists thu_ho_person text;

-- ── 4. Warehouse + stock_added cho supplier_orders ──────────────────────────
-- Cho phép Nhật ký mua vào tự cộng tồn kho khi chọn kho nhập (giống customer_orders)
alter table supplier_orders
  add column if not exists warehouse_id  uuid references warehouses(id),
  add column if not exists stock_added   boolean not null default false;

-- ── 5. Index cho công nợ ─────────────────────────────────────────────────────
-- Tăng tốc truy vấn bảng Công nợ tổng hợp
create index if not exists idx_co_outstanding
  on customer_orders(company_id, customer_id)
  where outstanding > 0;
create index if not exists idx_so_outstanding
  on supplier_orders(company_id, supplier_id)
  where outstanding > 0;
create index if not exists idx_ir_active
  on internal_receivables(person)
  where status = 'outstanding';
