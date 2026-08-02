-- KBIT seed data: chỉ giữ một công ty GLA.
-- Dữ liệu nghiệp vụ 01–06/2026 được sinh từ scripts/import-gla.mjs
-- vào data/gla-2026.json cho chế độ local.

-- Users (điền auth_id từ Supabase Auth > Users)
-- insert into users(auth_id, full_name, email, role) values
--  ('<UUID_ADMIN>','Admin','admin@kbit.vn','admin'),
--  ('<UUID_KTT>','Kế toán trưởng','ktt@kbit.vn','chief_accountant'),
--  ('<UUID_KT>','Kế toán','kt@kbit.vn','accountant'),
--  ('<UUID_VIEWER>','Xem báo cáo','viewer@kbit.vn','viewer');

-- Company
insert into companies(id, code, name, country, base_currency)
values (
  '10000000-0000-0000-0000-000000000003',
  'GLA',
  'CÔNG TY TNHH GLA VIỆT NAM',
  'VN',
  'VND'
)
on conflict (code) do update set
  name = excluded.name,
  country = excluded.country,
  base_currency = excluded.base_currency;

-- Không seed dữ liệu mẫu khác.
