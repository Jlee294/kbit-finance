-- ============================================================
-- 0019 — Cho phép Thu/Chi import từ sao kê chưa gán KH/NCC
--   KTT yêu cầu: cho phép lưu trước, gán KH/NCC sau khi đối chiếu
-- ============================================================

-- Bỏ NOT NULL trên customer_id để cho phép phiếu thu "chưa gắn KH"
alter table income_transactions
  alter column customer_id drop not null;

-- supplier_id đã nullable sẵn — không cần sửa

-- Bonus: index trên is_unassigned để filter phiếu cần gán sau
create index if not exists idx_income_unassigned
  on income_transactions(is_unassigned, txn_date)
  where is_unassigned = true;
