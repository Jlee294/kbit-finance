/**
 * KTT Cách B: Tài liệu schema nhúng vào system prompt — để bot viết SQL ĐÚNG.
 *
 * Quy tắc viết doc:
 *   - Chỉ liệt kê bảng + cột bot cần (không dump toàn schema).
 *   - Ghi rõ QUY ƯỚC NGHIỆP VỤ (status nào tính, tiền cột nào) — đây là chỗ
 *     bot hay sai nhất, không phải cú pháp SQL.
 *   - Khi đổi schema (migration mới) → cập nhật file này.
 */

export const SCHEMA_DOC = `
═══ SCHEMA DATABASE (PostgreSQL/Supabase) — dùng cho tool query_database ═══

QUY ƯỚC CHUNG:
• Mọi id là uuid. Ngày kiểu date 'YYYY-MM-DD'. Tiền là numeric (VND trừ khi ghi khác).
• Giao dịch hợp lệ = status IN ('confirmed','approved'). LOẠI 'void' (hủy) và thường loại 'draft' (nháp).
• Đơn bán hợp lệ = fulfillment_status != 'draft'.
• JOIN qua cột *_id. Luôn LIMIT kết quả. Max 200 dòng/query.

── DANH MỤC ──
companies(id, code, name, country, base_currency, is_active)
customers(id, code, name, tax_code, phone, note, is_active)            -- khách hàng
suppliers(id, code, name, country 'VN'|'KR', tax_code, phone, is_active) -- nhà cung cấp
products(id, code, name, unit, is_active)                              -- mã hàng
projects(id, code, name, company_id, is_active)
warehouses(id, code, name, company_id, is_active, is_default)          -- is_default = kho chính
bank_accounts(id, company_id, name, currency, is_active)
exchange_rates(...)                                                     -- tỷ giá

── ĐƠN BÁN (doanh thu) ──
customer_orders(id, company_id, customer_id, project_id, warehouse_id, order_code, order_date,
  fulfillment_status 'draft'|'confirmed'|'awaiting_goods'|'delivered',
  payment_status 'unpaid'|'partial'|'paid',
  grand_total, amount_paid, outstanding,        -- outstanding = còn KH nợ (VND)
  vat_pct, vat_amount, invoice_no, invoice_date, customer_tax_code,
  is_intercompany, stock_deducted, operation_id)
customer_order_items(id, order_id, product_id, description, qty, unit_price,
  lot_no, expiry_date,                          -- số lô + HSD dòng bán
  cost_price)                                   -- giá vốn đã chốt (null = chưa chốt kỳ)

── ĐƠN MUA / NHẬP KHẨU (chi phí hàng) ──
supplier_orders(id, company_id, supplier_id, project_id, warehouse_id, order_code, order_date,
  order_type 'domestic'|'import', currency 'VND'|'KRW', exchange_rate,
  goods_value, import_duty, vat_import, other_fees,
  cost_total,                                    -- giá vốn lô = goods+duty+fees (NGUYÊN TỆ, không gồm VAT)
  amount_paid, outstanding,                      -- outstanding = còn nợ NCC (NGUYÊN TỆ — đơn KRW phải × exchange_rate để ra VND)
  invoice_no, invoice_date, supplier_tax_code, vat_amount, stock_added, operation_id)
supplier_order_items(id, order_id, product_id, description, qty, unit_price, unit_cost, lot_no, expiry_date)

── THU / CHI (ngân hàng) ──
income_transactions(id, company_id, bank_account_id, customer_id, amount, currency, amount_vnd,
  txn_date, is_unassigned,                       -- true = thu chưa gắn đơn (cọc)
  note, status 'draft'|'confirmed'|'approved'|'void', dinh_khoan_no, dinh_khoan_co)
expense_transactions(id, company_id, bank_account_id, supplier_id, supplier_order_id,
  region 'VN'|'KR', txn_date, amount_vnd, amount_krw, exchange_rate,
  has_vat, vat_amount, is_chi_ho, expense_category, operation_id,
  note, status, dinh_khoan_no, dinh_khoan_co)
  -- QUY ƯỚC: tổng chi luôn dùng amount_vnd (đã quy đổi). supplier_order_id null = chi chưa gắn đơn.
payment_allocations(income_id, customer_order_id, allocated_amount)   -- 1 phiếu thu ↔ nhiều đơn
cash_book(id, company_id, ky_hieu, txn_date, so_tien, direction 'thu'|'chi',
  customer_id, supplier_id, status, note)        -- "Chứng từ khác" — chỉ tính status='confirmed'

── KHO ──
warehouse_stock(warehouse_id, product_id, qty_on_hand)                 -- tồn hiện tại theo kho
warehouse_transactions(id, txn_date, txn_type 'receipt'|'issue'|'transfer_out'|'transfer_in'|'order_deduction'|'adjustment'|'opening',
  company_id, warehouse_id, product_id, qty, reason, note, ref_order_id, to_warehouse_id,
  unit_cost, lot_no, expiry_date, has_invoice)   -- sổ cái kho; has_invoice=false → chưa có hóa đơn
kbit_stock_by_lot(product_id, lot_no, expiry_date, warehouse_id, qty_on_hand)
  -- VIEW: tồn theo LÔ + HSD (chỉ lô còn qty > 0). ƯU TIÊN dùng view này cho câu hỏi HSD/lô.
product_moving_cost(company_id, product_id, qty_on_hand, avg_cost)     -- giá vốn BQ liên hoàn hiện hành

── THUẾ / KẾ HOẠCH ──
tax_compliance_calendar(id, company_id, tax_type, period, due_date, filed_date,
  status 'pending'|'filed'|'overdue', note)      -- lịch thuế; trễ hạn = filed_date > due_date
tax_plans(id, company_id, project_id, year, plan_data jsonb)           -- kế hoạch thuế (16 chỉ tiêu trong plan_data.rows)
accounting_periods(id, company_id, period 'YYYY-MM', status 'open'|'locked')

── KHÁC ──
tasks(id, title, status 'open'|'in_progress'|'done'|'overdue', due_date, note, assigned_to, auto_generated)
documents(id, document_type_id, entity_type 'customer_order'|'supplier_order'|'income'|'expense',
  entity_id, file_name, is_verified)             -- chứng từ đính kèm
document_types(id, code, name)
operation_library(id, code, name, group_name, required_doc_type_ids uuid[], recommended_doc_type_ids uuid[])
users(id, full_name, role, is_active)            -- KHÔNG query email/auth — chỉ full_name khi cần tên người

── CÔNG THỨC NGHIỆP VỤ HAY DÙNG ──
• Tổng doanh thu kỳ      = SUM(customer_orders.grand_total) WHERE fulfillment_status != 'draft' AND order_date trong kỳ
• Tổng phải thu hiện tại = SUM(customer_orders.outstanding) WHERE fulfillment_status != 'draft'
• Tổng phải trả NCC      = SUM(supplier_orders.outstanding × CASE currency WHEN 'KRW' THEN exchange_rate ELSE 1 END)
• Tổng thu tiền kỳ       = SUM(income_transactions.amount_vnd hoặc amount) WHERE status IN ('confirmed','approved')
• Tổng chi kỳ            = SUM(expense_transactions.amount_vnd) WHERE status IN ('confirmed','approved')
• Tồn kho 1 mã           = SUM(warehouse_stock.qty_on_hand) GROUP BY product_id
• HSD sắp hết            = kbit_stock_by_lot WHERE expiry_date <= current_date + interval 'N days'
═══════════════════════════════════════════════════════════════════
`
