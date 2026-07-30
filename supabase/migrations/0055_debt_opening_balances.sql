-- Bảng lưu số dư đầu kỳ công nợ (phải thu / phải trả) nhập tay.
-- Tương tự warehouse_transactions.opening cho tồn kho.
create table if not exists debt_opening_balances (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id),
  partner_type  text not null check (partner_type in ('customer', 'supplier')),
  partner_id    uuid not null,
  year          int  not null,
  debit_amount  numeric(18,2) not null default 0,
  credit_amount numeric(18,2) not null default 0,
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(company_id, partner_type, partner_id, year)
);

alter table debt_opening_balances enable row level security;

create policy "Authenticated users can read debt_opening_balances"
  on debt_opening_balances for select to authenticated using (true);

create policy "Authenticated users can insert debt_opening_balances"
  on debt_opening_balances for insert to authenticated with check (true);

create policy "Authenticated users can update debt_opening_balances"
  on debt_opening_balances for update to authenticated using (true);

create policy "Authenticated users can delete debt_opening_balances"
  on debt_opening_balances for delete to authenticated using (true);
