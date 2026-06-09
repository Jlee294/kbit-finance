-- =====================================================================
-- 0041 — KTT C3: cờ "Chưa có hóa đơn" cho ghi sổ kho không kèm HĐ
-- =====================================================================
-- Bối cảnh:
--   Khi xuất/nhập kho mà CHƯA có hóa đơn (HĐ về sau / xuất tạm) → cần đánh
--   dấu để KTT biết phải bổ sung hóa đơn cho dòng đó sau.
--
-- Default true (có HĐ) → toàn bộ data cũ + 'opening'/đơn bán/mua đã match HĐ
-- vẫn được tính là "có HĐ" tự nhiên. Chỉ ghi sổ thủ công mới có thể tick false.
--
-- Mở rộng UI:
--   • StockMutationForm thêm checkbox "Chưa có hóa đơn"
--   • /kho/lich-su filter chỉ những dòng has_invoice=false để KTT theo dõi
-- =====================================================================

alter table warehouse_transactions
  add column if not exists has_invoice boolean not null default true;

-- Index một phần: chỉ index những dòng CHƯA có HĐ (tập nhỏ, query nhanh)
create index if not exists idx_wtxn_no_invoice
  on warehouse_transactions(txn_date desc)
  where has_invoice = false;

-- Update RPC kbit_adjust_stock + kbit_receive_stock + kbit_deduct_order_item
-- để nhận p_has_invoice (mặc định true → không phá caller cũ).
-- Tuy nhiên các RPC này nhiều và phức tạp; thay vì sửa từng cái, ta để app
-- update has_invoice ngay sau khi RPC ghi xong (đơn giản, không phá schema).

comment on column warehouse_transactions.has_invoice is
  'KTT C3: false = chưa có hóa đơn → cần bổ sung sau';

-- =====================================================================
-- KTT C1: Unique constraint cho tax_plans (cho phép nhiều plan cho cùng
--   1 cty/năm nhưng MỖI dự án 1 plan). project_id NULL = plan toàn cty.
-- =====================================================================
create unique index if not exists ux_tax_plans_company_project_year
  on tax_plans (company_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), year);

