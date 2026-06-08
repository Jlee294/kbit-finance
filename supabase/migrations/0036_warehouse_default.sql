-- 0036: "Kho chính" (is_default) cho đồng bộ kho tự động (Nhóm B)
-- Mục tiêu: khi tạo đơn bán/mua không chọn kho, hệ thống tự dùng kho chính của công ty.

-- 1) Cột kho chính
alter table warehouses add column if not exists is_default boolean not null default false;

-- 2) Ràng buộc: tối đa 1 kho chính / công ty (partial unique — chỉ soi các dòng is_default)
create unique index if not exists warehouses_one_default_per_company
  on warehouses(company_id) where is_default;

-- 3) Backfill: mỗi công ty CHƯA có kho chính → đặt kho active có code nhỏ nhất làm chính
with ranked as (
  select id, row_number() over (partition by company_id order by code) rn
  from warehouses
  where is_active and company_id is not null
    and company_id not in (
      select company_id from warehouses where is_default and company_id is not null
    )
)
update warehouses w set is_default = true
from ranked r
where w.id = r.id and r.rn = 1;

-- 4) Hàm chọn kho mặc định của 1 công ty:
--    ưu tiên kho chính (is_default), rồi code nhỏ nhất; NULL nếu công ty không có kho active.
create or replace function kbit_default_warehouse(p_company_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from warehouses
  where company_id = p_company_id and is_active
  order by is_default desc, code asc
  limit 1
$$;
