-- =====================================================================
-- 0042 — KTT D1: Unique constraint cho tax_compliance_calendar
--   Cho phép upsert idempotent khi lập lịch cả năm (generateYearlyCalendar)
--   Mỗi (cty, loại thuế, kỳ) chỉ có 1 dòng — chạy lại không tạo trùng.
-- =====================================================================

-- Dọn trùng trước nếu có (giữ dòng cũ nhất theo created_at)
delete from tax_compliance_calendar a
using tax_compliance_calendar b
where a.id <> b.id
  and a.company_id = b.company_id
  and a.tax_type   = b.tax_type
  and a.period     = b.period
  and a.created_at > b.created_at;

-- Thêm unique constraint
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ux_tax_calendar_company_type_period'
  ) then
    alter table tax_compliance_calendar
      add constraint ux_tax_calendar_company_type_period
      unique (company_id, tax_type, period);
  end if;
end $$;
