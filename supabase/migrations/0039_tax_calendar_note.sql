-- 0039: Vá bug có sẵn — tax_compliance_calendar thiếu cột "note" nhưng code
-- (listCalendar / form Thêm / TaxCalendarTable) đã đọc-ghi note → trang Lịch thuế vỡ
-- khi có dữ liệu. Thêm cột note (idempotent).
alter table tax_compliance_calendar add column if not exists note text;
