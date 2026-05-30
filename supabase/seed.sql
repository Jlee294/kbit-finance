-- KBIT seed data (dùng sau khi đã tạo user trong Supabase Auth và điền auth_id thật)
-- Thay <UUID_ADMIN>, <UUID_KTT>, <UUID_KT>, <UUID_VIEWER> bằng auth.uid() thật từ Supabase Dashboard

-- Users (điền auth_id từ Supabase Auth > Users)
-- insert into users(auth_id, full_name, email, role) values
--  ('<UUID_ADMIN>','Admin','admin@kbit.vn','admin'),
--  ('<UUID_KTT>','Kế toán trưởng','ktt@kbit.vn','chief_accountant'),
--  ('<UUID_KT>','Kế toán','kt@kbit.vn','accountant'),
--  ('<UUID_VIEWER>','Xem báo cáo','viewer@kbit.vn','viewer');

-- Companies
insert into companies(code, name, country, base_currency) values
  ('MINTVN', 'Mint Korea Việt Nam', 'VN', 'VND'),
  ('KBIT', 'KBIT Holdings', 'VN', 'VND'),
  ('GLA', 'GLA', 'VN', 'VND');

-- Thêm bank_accounts, customers, suppliers sau khi đã có company_id
