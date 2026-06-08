-- =====================================================================
-- 0027 — CHO PHÉP tồn kho âm
-- =====================================================================
-- Anh Thịnh chốt (2026-06-04): cho phép kho ghi âm ở MỌI thao tác xuất kho
--   (xuất bán dù tồn hệ thống chưa kịp cập nhật; tồn âm hiển thị ĐỎ ở UI để
--   nhập bù). Đây là ĐẢO quyết định chặn âm ở 0012/0025.
--
-- Chỉ cần gỡ constraint warehouse_stock_non_negative (qty_on_hand >= 0).
--   Các hàm kho ở 0025 dùng pattern "insert 0 ON CONFLICT DO NOTHING → UPDATE
--   qty ± delta": sau khi bỏ constraint, UPDATE ra âm KHÔNG còn raise → tồn
--   xuống âm bình thường. KHÔNG cần sửa thân RPC.
--
-- LƯU Ý: các comment "CHECK chặn nếu xuất quá tồn" trong các hàm 0025
--   (kbit_issue_stock / kbit_deduct_order_item / kbit_transfer_stock_full)
--   từ nay KHÔNG còn hiệu lực — đã cố ý cho phép âm.
-- Giữ nguyên warehouse_transactions.qty > 0 (sổ cái luôn ghi qty dương,
--   chiều thể hiện qua txn_type).
-- =====================================================================

alter table warehouse_stock drop constraint if exists warehouse_stock_non_negative;
