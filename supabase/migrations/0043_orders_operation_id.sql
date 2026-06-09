-- =====================================================================
-- 0043 — KTT D3: Link operation_library cho đơn bán + đơn mua
--   Khi tạo đơn (đặc biệt nhập khẩu), user chọn nghiệp vụ (operation) →
--   app auto-list checklist chứng từ cần có (required_doc_type_ids).
--   Nullable để không phá data cũ.
-- =====================================================================

alter table customer_orders
  add column if not exists operation_id uuid references operation_library(id);

alter table supplier_orders
  add column if not exists operation_id uuid references operation_library(id);

create index if not exists idx_customer_orders_operation
  on customer_orders(operation_id) where operation_id is not null;

create index if not exists idx_supplier_orders_operation
  on supplier_orders(operation_id) where operation_id is not null;

comment on column customer_orders.operation_id is
  'KTT D3: link Thư viện NV → auto-list chứng từ cần có';
comment on column supplier_orders.operation_id is
  'KTT D3: link Thư viện NV → auto-list chứng từ cần có';
