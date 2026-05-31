-- ============================================================
-- 0015 — RLS policies cho brands dùng role CEO
-- Chạy SAU 0014 (sau khi enum 'ceo' đã được commit)
-- ============================================================

-- Xoá policies cũ
drop policy if exists "viewer_select_brands" on brands;
drop policy if exists "editor_insert_brands" on brands;
drop policy if exists "editor_update_brands" on brands;
drop policy if exists "admin_delete_brands"  on brands;

-- Tạo lại: chỉ admin + ceo
create policy "ceo_select_brands" on brands
  for select using (kbit_role() in ('admin', 'ceo'));

create policy "ceo_insert_brands" on brands
  for insert with check (kbit_role() in ('admin', 'ceo'));

create policy "ceo_update_brands" on brands
  for update using (kbit_role() in ('admin', 'ceo'));

create policy "admin_delete_brands" on brands
  for delete using (kbit_role() = 'admin');
