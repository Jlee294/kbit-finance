-- Tổng giá nhập kho và VAT nhập khẩu khấu trừ đều là VNĐ sau khi quy đổi
-- từng cấu phần theo tỷ giá riêng. Không dùng cost_total cũ để báo cáo giá vốn.
alter table supplier_orders
  add column if not exists landed_cost_vnd numeric(18,2) not null default 0,
  add column if not exists recoverable_import_vat_vnd numeric(18,2) not null default 0;

comment on column supplier_orders.landed_cost_vnd is
  'Tiền hàng + vận chuyển/dịch vụ + thuế nhập khẩu sau quy đổi riêng; loại VAT nhập khẩu được khấu trừ.';
comment on column supplier_orders.recoverable_import_vat_vnd is
  'VAT nhập khẩu được khấu trừ sau quy đổi, không vào giá vốn.';
