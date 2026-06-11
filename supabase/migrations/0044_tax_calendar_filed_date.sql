-- =====================================================================
-- 0044 — KTT F1: Lịch thuế ghi ngày nộp + so sánh trễ hạn
-- =====================================================================
-- KTT: 'Khi click vào đã nộp => nó sẽ ghi lại ngày nộp => để so sánh trễ hạn
--       (cho phép chỉnh lại ngày nộp vì một số trường hợp đã nộp nhưng quên ghi lại)'
--
-- Thêm cột:
--   filed_date  date  — ngày thực tế nộp (NULL = chưa nộp / status != 'filed')
--   filed_by    uuid  — ai đánh dấu nộp (audit nhẹ)
--
-- Logic UI:
--   • Bấm 'Đã nộp' → set filed_date = today (default), filed_by = me
--   • Hiển thị filed_date kèm badge 'Trễ X ngày' / 'Đúng hạn' so với due_date
--   • Cho phép sửa filed_date qua input date inline (KTT yêu cầu)
-- =====================================================================

alter table tax_compliance_calendar
  add column if not exists filed_date date,
  add column if not exists filed_by   uuid references users(id);

-- Backfill: dòng đã filed nhưng chưa có filed_date → set theo due_date làm proxy
update tax_compliance_calendar
  set filed_date = due_date
where status = 'filed' and filed_date is null;

create index if not exists idx_tax_calendar_filed_date
  on tax_compliance_calendar(filed_date)
  where status = 'filed';

comment on column tax_compliance_calendar.filed_date is
  'KTT F1: ngày thực tế nộp (so với due_date để báo trễ/đúng hạn)';
