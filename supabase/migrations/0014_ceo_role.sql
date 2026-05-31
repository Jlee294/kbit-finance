-- ============================================================
-- 0014 — Thêm role CEO, giới hạn xem brands + giá vốn
-- ============================================================

-- Thêm 'ceo' vào enum user_role
do $$ begin
  alter type user_role add value if not exists 'ceo';
exception when others then null;
end $$;

-- Cập nhật RLS brands: chỉ admin + ceo mới xem được
drop policy if exists "viewer_select_brands" on brands;

create policy "ceo_select_brands" on brands
  for select using (kbit_role() in ('admin', 'ceo'));

-- Chỉ admin + ceo mới thêm/sửa brand
drop policy if exists "editor_insert_brands" on brands;
drop policy if exists "editor_update_brands" on brands;
drop policy if exists "admin_delete_brands"  on brands;

create policy "ceo_insert_brands" on brands
  for insert with check (kbit_role() in ('admin', 'ceo'));

create policy "ceo_update_brands" on brands
  for update using (kbit_role() in ('admin', 'ceo'));

create policy "admin_delete_brands" on brands
  for delete using (kbit_role() = 'admin');
