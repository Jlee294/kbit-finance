-- KBIT 0029 — Thêm loại giao dịch 'opening' (số dư đầu kỳ) vào sổ kho.
-- Tách riêng khỏi 0030: value enum mới không dùng được trong cùng transaction vừa thêm.
alter type warehouse_txn_type add value if not exists 'opening';
