-- =====================================================================
-- 0050 — PHÂN QUYỀN THEO CÔNG TY (company-scoped access)
-- =====================================================================
-- KTT chốt: admin/ceo/chief_accountant THẤY TẤT CẢ công ty;
--           accountant/viewer chỉ thấy công ty được GÁN (user_companies).
--
-- Phạm vi: scope SELECT trên các bảng CÓ company_id + bảng companies
-- (dropdown). Write giữ kbit_can_edit() — user thấp quyền không thấy
-- công ty khác trong UI nên không tạo nhầm; scope write là bước sau nếu cần.
-- =====================================================================

-- ── Bảng gán user ↔ công ty ──────────────────────────────────────────
create table if not exists user_companies (
  user_id    uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

alter table user_companies enable row level security;
-- Đọc: chính chủ xem được phần gán của mình; admin xem tất cả
drop policy if exists user_companies_sel on user_companies;
create policy user_companies_sel on user_companies
  for select using (
    kbit_role() = 'admin'
    or user_id = (select id from users where auth_id = auth.uid())
  );
-- Ghi: chỉ admin gán
drop policy if exists user_companies_ins on user_companies;
create policy user_companies_ins on user_companies
  for insert with check (kbit_role() = 'admin');
drop policy if exists user_companies_del on user_companies;
create policy user_companies_del on user_companies
  for delete using (kbit_role() = 'admin');

create index if not exists idx_user_companies_user on user_companies(user_id);

-- ── Helper: user hiện tại có quyền truy cập 1 công ty? ────────────────
-- admin/ceo/chief_accountant → true mọi công ty.
-- accountant/viewer → chỉ công ty trong user_companies.
create or replace function kbit_can_access_company(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    kbit_role() in ('admin', 'ceo', 'chief_accountant')
    or (p_company_id is not null and exists (
      select 1
      from user_companies uc
      join users u on u.id = uc.user_id
      where u.auth_id = auth.uid()
        and uc.company_id = p_company_id
    ))
$$;

-- ── Scope SELECT các bảng CÓ company_id ──────────────────────────────
-- Pattern: kbit_role() is not null (đã đăng nhập + active) AND truy cập được công ty.

-- companies: dropdown chỉ hiện công ty được phép
drop policy if exists companies_sel on companies;
create policy companies_sel on companies
  for select using (kbit_role() is not null and kbit_can_access_company(id));

-- income / expense
drop policy if exists income_transactions_sel on income_transactions;
create policy income_transactions_sel on income_transactions
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

drop policy if exists expense_transactions_sel on expense_transactions;
create policy expense_transactions_sel on expense_transactions
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

-- đơn bán / đơn mua
drop policy if exists customer_orders_sel on customer_orders;
create policy customer_orders_sel on customer_orders
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

drop policy if exists supplier_orders_sel on supplier_orders;
create policy supplier_orders_sel on supplier_orders
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

-- chứng từ khác (cash_book) — policy gốc tên "cb_select"
drop policy if exists "cb_select" on cash_book;
create policy "cb_select" on cash_book
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

-- kỳ kế toán
drop policy if exists accounting_periods_sel on accounting_periods;
create policy accounting_periods_sel on accounting_periods
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

-- lịch thuế + kế hoạch thuế
drop policy if exists tax_compliance_calendar_sel on tax_compliance_calendar;
create policy tax_compliance_calendar_sel on tax_compliance_calendar
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

drop policy if exists tax_plans_sel on tax_plans;
create policy tax_plans_sel on tax_plans
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

-- dự án + tài khoản ngân hàng
drop policy if exists projects_sel on projects;
create policy projects_sel on projects
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

drop policy if exists bank_accounts_sel on bank_accounts;
create policy bank_accounts_sel on bank_accounts
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

-- kho + sổ kho (đã có company_id từ 0033)
drop policy if exists warehouses_sel on warehouses;
create policy warehouses_sel on warehouses
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

drop policy if exists wtxn_sel on warehouse_transactions;
create policy wtxn_sel on warehouse_transactions
  for select using (kbit_role() is not null and kbit_can_access_company(company_id));

comment on table user_companies is
  '0050: gán user ↔ công ty. accountant/viewer chỉ thấy công ty được gán; admin/ceo/KTT thấy tất cả.';
comment on function kbit_can_access_company(uuid) is
  '0050: true nếu user hiện tại được xem công ty này (cấp quản lý=mọi cty, còn lại theo user_companies).';
