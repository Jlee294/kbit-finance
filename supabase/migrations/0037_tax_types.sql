-- 0037: Danh mục "Loại thuế" (tax_types) — cho thêm/sửa/ẩn loại thuế qua UI
-- thay cho enum cứng. Lịch thuế + Kế hoạch thuế đọc loại thuế từ bảng này.
-- Cột tax_type ở tax_compliance_calendar/tax_plans vẫn là TEXT (không FK) để linh hoạt
-- và không phá dữ liệu lịch sử.

create table if not exists tax_types (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,   -- ẩn (ngừng dùng) thay vì xóa cứng
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS: mọi user đăng nhập ĐỌC được; GHI cần quyền duyệt (admin/KTT/CEO) — giống danh mục khác.
alter table tax_types enable row level security;
create policy tax_types_sel on tax_types for select using (kbit_role() is not null);
create policy tax_types_w   on tax_types for all using (kbit_can_approve()) with check (kbit_can_approve());

-- Seed 5 loại mặc định (giữ đúng các loại đang dùng trong code cũ).
insert into tax_types (code, name, sort_order) values
  ('GTGT', 'Thuế GTGT',           10),
  ('TNDN', 'Thuế TNDN',           20),
  ('TNCN', 'Thuế TNCN',           30),
  ('FCT',  'Thuế nhà thầu (FCT)', 40),
  ('BHXH', 'BHXH',                50)
on conflict (code) do nothing;
