-- ============================================================
-- 0021 — Hỗ trợ đính kèm file cho Chứng từ khác (cash_book)
-- ============================================================
-- Thêm 'cash_book' vào enum doc_entity_type để có thể upload
-- chứng từ scan cho phiếu thu/chi tiền mặt.

alter type doc_entity_type add value if not exists 'cash_book';
