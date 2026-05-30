-- =====================================================================
-- Phase 2: ghi thu atomic (RPC) + VIEW số dư ngân hàng chuẩn D2
-- =====================================================================

-- Chống phân bổ TRÙNG cùng 1 đơn trong cùng 1 phiếu thu (lỗi nhập liệu).
alter table payment_allocations
  add constraint uq_alloc_income_order unique (income_id, customer_order_id);

-- Kiểu tham số phân bổ (1 phần tử = 1 đơn được phân bổ)
create type income_alloc_input as (
  customer_order_id uuid,
  allocated_amount  numeric(18,2)
);

-- ─── Hàm ghi 1 phiếu thu + phân bổ nhiều đơn + thu thừa → prepaid_balance ───
-- SECURITY INVOKER (mặc định): giữ RLS theo JWT người gọi.
-- Toàn bộ thân hàm chạy trong 1 transaction → atomic.
create or replace function kbit_record_income(
  p_company_id      uuid,
  p_bank_account_id uuid,
  p_customer_id     uuid,
  p_amount          numeric,
  p_txn_date        date,
  p_note            text,
  p_allocations     income_alloc_input[],  -- rỗng '{}' = tiền cọc chưa gắn đơn
  p_project_id      uuid default null      -- [D16] dự án của phiếu thu (tùy chọn)
)
returns uuid                               -- trả về income_transactions.id
language plpgsql
as $$
declare
  v_income_id   uuid;
  v_alloc_total numeric(18,2) := 0;
  v_overpay     numeric(18,2);
  a             income_alloc_input;
  v_order_company  uuid;
  v_order_customer uuid;
  v_bank_currency  currency_code;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Số tiền phiếu thu phải lớn hơn 0';
  end if;

  -- [D2] income.currency = currency của tài khoản nhận tiền
  select currency into v_bank_currency from bank_accounts where id = p_bank_account_id;
  if v_bank_currency is null then
    raise exception 'Tài khoản ngân hàng % không tồn tại', p_bank_account_id;
  end if;

  -- Vòng 1: kiểm tra hợp lệ + tính tổng phân bổ (chưa ghi gì)
  foreach a in array coalesce(p_allocations, '{}'::income_alloc_input[]) loop
    if a.allocated_amount is null or a.allocated_amount <= 0 then
      raise exception 'Số tiền phân bổ phải lớn hơn 0';
    end if;
    select company_id, customer_id into v_order_company, v_order_customer
      from customer_orders where id = a.customer_order_id;
    if v_order_company is null then
      raise exception 'Đơn % không tồn tại', a.customer_order_id;
    end if;
    if v_order_company <> p_company_id then
      raise exception 'Đơn % khác công ty với phiếu thu', a.customer_order_id;
    end if;
    if v_order_customer <> p_customer_id then
      raise exception 'Đơn % khác khách hàng với phiếu thu', a.customer_order_id;
    end if;
    v_alloc_total := v_alloc_total + a.allocated_amount;
  end loop;

  if v_alloc_total > p_amount then
    raise exception 'Tổng phân bổ (%) vượt quá tiền phiếu thu (%)', v_alloc_total, p_amount;
  end if;

  -- 1) Ghi phiếu thu
  insert into income_transactions(
    company_id, bank_account_id, customer_id, amount, txn_date,
    is_unassigned, note, status, created_by, currency, amount_vnd, project_id)
  values (
    p_company_id, p_bank_account_id, p_customer_id, p_amount, p_txn_date,
    (v_alloc_total = 0), p_note, 'confirmed',
    (select id from public.users where auth_id = auth.uid()),
    v_bank_currency,
    case when v_bank_currency = 'VND' then p_amount else null end,
    p_project_id)
  returning id into v_income_id;

  -- 2) Ghi từng dòng phân bổ + cộng amount_paid + cập nhật payment_status
  foreach a in array coalesce(p_allocations, '{}'::income_alloc_input[]) loop
    insert into payment_allocations(income_id, customer_order_id, allocated_amount)
    values (v_income_id, a.customer_order_id, a.allocated_amount);

    update customer_orders
       set amount_paid    = amount_paid + a.allocated_amount,
           payment_status = case
             when amount_paid + a.allocated_amount >= grand_total then 'paid'::payment_status
             when amount_paid + a.allocated_amount > 0            then 'partial'::payment_status
             else 'unpaid'::payment_status end
     where id = a.customer_order_id;
  end loop;

  -- 3) Thu THỪA (phiếu > tổng phân bổ, khi có phân bổ) → cộng prepaid_balance
  v_overpay := p_amount - v_alloc_total;
  if v_overpay > 0 and v_alloc_total > 0 then
    update customers set prepaid_balance = prepaid_balance + v_overpay
     where id = p_customer_id;
  end if;

  return v_income_id;
end $$;

revoke all on function kbit_record_income(uuid,uuid,uuid,numeric,date,text,income_alloc_input[],uuid) from public;
grant execute on function kbit_record_income(uuid,uuid,uuid,numeric,date,text,income_alloc_input[],uuid) to authenticated;

-- ─── Gắn phiếu thu cọc (is_unassigned) vào các đơn về sau ───────────────────
create or replace function kbit_assign_deposit(
  p_income_id   uuid,
  p_allocations income_alloc_input[]
)
returns void
language plpgsql
as $$
declare
  a             income_alloc_input;
  v_amount      numeric(18,2);
  v_customer    uuid;
  v_company     uuid;
  v_already     numeric(18,2);
  v_alloc_total numeric(18,2) := 0;
  v_overpay     numeric(18,2);
  v_oc          uuid;
  v_ocust       uuid;
begin
  select amount, customer_id, company_id into v_amount, v_customer, v_company
    from income_transactions where id = p_income_id for update;
  if v_amount is null then raise exception 'Phiếu thu không tồn tại'; end if;

  select coalesce(sum(allocated_amount),0) into v_already
    from payment_allocations where income_id = p_income_id;

  -- Vòng 1: kiểm tra hợp lệ
  foreach a in array coalesce(p_allocations, '{}'::income_alloc_input[]) loop
    if a.allocated_amount is null or a.allocated_amount <= 0 then
      raise exception 'Số tiền phân bổ phải lớn hơn 0';
    end if;
    select company_id, customer_id into v_oc, v_ocust from customer_orders where id = a.customer_order_id;
    if v_oc is null then raise exception 'Đơn % không tồn tại', a.customer_order_id; end if;
    if v_oc <> v_company then raise exception 'Đơn % khác công ty phiếu thu', a.customer_order_id; end if;
    if v_ocust <> v_customer then raise exception 'Đơn % khác khách hàng phiếu thu', a.customer_order_id; end if;
    v_alloc_total := v_alloc_total + a.allocated_amount;
  end loop;

  if v_already + v_alloc_total > v_amount then
    raise exception 'Tổng phân bổ vượt tiền phiếu thu cọc';
  end if;

  -- Vòng 2: ghi phân bổ + cộng amount_paid + cập nhật payment_status
  foreach a in array coalesce(p_allocations, '{}'::income_alloc_input[]) loop
    insert into payment_allocations(income_id, customer_order_id, allocated_amount)
    values (p_income_id, a.customer_order_id, a.allocated_amount);

    update customer_orders
       set amount_paid    = amount_paid + a.allocated_amount,
           payment_status = case
             when amount_paid + a.allocated_amount >= grand_total then 'paid'::payment_status
             when amount_paid + a.allocated_amount > 0            then 'partial'::payment_status
             else 'unpaid'::payment_status end
     where id = a.customer_order_id;
  end loop;

  update income_transactions
     set is_unassigned = (v_already + v_alloc_total = 0)
   where id = p_income_id;

  v_overpay := v_amount - (v_already + v_alloc_total);
  if v_overpay > 0 and (v_already + v_alloc_total) > 0 then
    update customers set prepaid_balance = prepaid_balance + v_overpay where id = v_customer;
  end if;
end $$;

revoke all on function kbit_assign_deposit(uuid,income_alloc_input[]) from public;
grant execute on function kbit_assign_deposit(uuid,income_alloc_input[]) to authenticated;

-- ─── VIEW số dư chuẩn DUY NHẤT (C2/D2) ──────────────────────────────────────
-- Trừ chi theo ĐÚNG currency tài khoản (VND → amount_vnd, KRW → amount_krw).
-- Chỉ trả (bank_account_id, currency, balance). JOIN bank_accounts khi cần tên/công ty.
create or replace view v_bank_balances with (security_invoker = on) as
select ba.id as bank_account_id, ba.currency,
  coalesce((select sum(i.amount) from income_transactions i
            where i.bank_account_id = ba.id and i.status in ('confirmed','approved')), 0)
  - coalesce((select sum(case when ba.currency = 'VND' then e.amount_vnd else e.amount_krw end)
              from expense_transactions e
              where e.bank_account_id = ba.id and e.status in ('confirmed','approved')), 0)
  as balance
from bank_accounts ba;
