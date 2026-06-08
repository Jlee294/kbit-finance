-- ============================================================
-- 0023 — Nới quyền: kế toán (accountant) được THÊM/SỬA Mã hàng (products)
--   Trước: policy products_w (FOR ALL) chỉ admin + chief_accountant
--          (kbit_can_approve) → accountant KHÔNG thêm được mã hàng.
--   Sau:  • INSERT + UPDATE: kbit_can_edit() (admin + chief_accountant + accountant)
--           để kế toán thêm mã hàng ở danh mục "Mã hàng" và ngay khi nhập hóa đơn.
--         • DELETE: vẫn chỉ admin (kbit_is_admin).
--         • SELECT: giữ nguyên policy products_sel (mọi user đã đăng nhập).
-- ============================================================

drop policy if exists products_w on products;

create policy products_ins on products
  for insert with check (kbit_can_edit());

create policy products_upd on products
  for update using (kbit_can_edit()) with check (kbit_can_edit());

create policy products_del on products
  for delete using (kbit_is_admin());
