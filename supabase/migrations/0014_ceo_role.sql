-- ============================================================
-- 0014 — Thêm role CEO vào enum (PHẢI chạy riêng, commit trước)
-- Chạy file này TRƯỚC, sau đó chạy 0015_ceo_role_policies.sql
-- ============================================================

-- QUAN TRỌNG: PostgreSQL yêu cầu ALTER TYPE ADD VALUE phải được
-- commit xong trước khi dùng value mới trong cùng một transaction.
-- Vì vậy file này chỉ chứa lệnh thêm enum, policies ở file 0015.

alter type user_role add value if not exists 'ceo';
