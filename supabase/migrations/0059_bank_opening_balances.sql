-- =============================================================================
-- 0059 — SỐ DƯ ĐẦU KỲ NGÂN HÀNG THEO TÀI KHOẢN VÀ NĂM
-- =============================================================================

-- Khóa ghép bảo đảm không thể khai số dư bằng tài khoản của công ty khác.
do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'bank_accounts_id_company_unique'
  ) then
    alter table bank_accounts
      add constraint bank_accounts_id_company_unique unique (id, company_id);
  end if;
end $$;

create table if not exists bank_opening_balances (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  bank_account_id  uuid not null,
  year             int not null check (year between 2020 and 2099),
  amount           numeric(24,2) not null default 0,
  note             text,
  created_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint bank_opening_account_company_fk
    foreign key (bank_account_id, company_id)
    references bank_accounts(id, company_id) on delete cascade,
  unique(bank_account_id, year)
);

create index if not exists idx_bank_opening_company_year
  on bank_opening_balances(company_id, year);

drop trigger if exists trg_bank_opening_updated on bank_opening_balances;
create trigger trg_bank_opening_updated
  before update on bank_opening_balances
  for each row execute function set_updated_at();

alter table bank_opening_balances enable row level security;

create policy bank_opening_balances_sel on bank_opening_balances
  for select using (
    kbit_role() is not null
    and kbit_can_access_company(company_id)
  );
create policy bank_opening_balances_ins on bank_opening_balances
  for insert with check (
    kbit_can_edit()
    and kbit_can_access_company(company_id)
  );
create policy bank_opening_balances_upd on bank_opening_balances
  for update using (
    kbit_can_edit()
    and kbit_can_access_company(company_id)
  ) with check (
    kbit_can_edit()
    and kbit_can_access_company(company_id)
  );
create policy bank_opening_balances_del on bank_opening_balances
  for delete using (
    kbit_can_approve()
    and kbit_can_access_company(company_id)
  );

-- Số dư hiện tại chuẩn = số dư đầu năm gần nhất + thu/chi kể từ đầu năm đó.
-- Nếu chưa từng khai đầu kỳ, giữ tương thích cũ: tính toàn bộ thu trừ chi.
create or replace view v_bank_balances with (security_invoker = on) as
select
  ba.id as bank_account_id,
  ba.currency,
  coalesce(opening.amount, 0)
  + coalesce((
      select sum(i.amount)
        from income_transactions i
       where i.bank_account_id = ba.id
         and i.status in ('confirmed','approved')
         and (
           opening.year is null
           or i.txn_date >= make_date(opening.year, 1, 1)
         )
    ), 0)
  - coalesce((
      select sum(
        case when ba.currency = 'VND' then e.amount_vnd else e.amount_krw end
      )
        from expense_transactions e
       where e.bank_account_id = ba.id
         and e.status in ('confirmed','approved')
         and (
           opening.year is null
           or e.txn_date >= make_date(opening.year, 1, 1)
         )
    ), 0) as balance
from bank_accounts ba
left join lateral (
  select bob.year, bob.amount
    from bank_opening_balances bob
   where bob.bank_account_id = ba.id
   order by bob.year desc
   limit 1
) opening on true;
