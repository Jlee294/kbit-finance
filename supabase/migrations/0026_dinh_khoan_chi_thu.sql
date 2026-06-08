-- =====================================================================
-- 0026 — Định khoản tay (Nợ/Có) cho phiếu THU & CHI
-- Đơn hàng & sổ quỹ đã có dinh_khoan_no/co (0016); phiếu chi/thu thì chưa.
-- (a) Thêm 2 cột vào expense_transactions + income_transactions.
-- (b) Cập nhật 5 RPC ghi thu/chi để nhận + lưu định khoản.
--     Thêm tham số = đổi chữ ký → phải DROP bản cũ trước rồi CREATE lại
--     (create or replace không đổi được danh sách tham số).
--     Thân hàm giữ NGUYÊN từ 0003/0004/0005/0024 (đã xác minh không bản nào
--     sửa lại sau đó), chỉ thêm 2 cột định khoản vào INSERT.
-- =====================================================================

-- ── (a) Thêm cột (nullable — an toàn, không phá dữ liệu cũ) ──────────────────
alter table expense_transactions
  add column if not exists dinh_khoan_no text,
  add column if not exists dinh_khoan_co text;
alter table income_transactions
  add column if not exists dinh_khoan_no text,
  add column if not exists dinh_khoan_co text;

-- ── (b1) kbit_create_expense_vn (gốc 0004) ──────────────────────────────────
drop function if exists kbit_create_expense_vn(
  uuid, uuid, date, numeric, text, boolean, numeric,
  boolean, text, text, uuid, boolean, uuid, uuid, uuid, uuid
);

create function kbit_create_expense_vn(
  p_company_id              uuid,
  p_bank_account_id         uuid,
  p_txn_date                date,
  p_amount_vnd              numeric,
  p_note                    text       default null,
  p_has_vat                 boolean    default false,
  p_vat_amount              numeric    default 0,
  p_is_chi_ho               boolean    default false,
  p_chi_ho_person           text       default null,
  p_expense_category        text       default null,
  p_operation_id            uuid       default null,
  p_is_intercompany         boolean    default false,
  p_counterpart_company_id  uuid       default null,
  p_project_id              uuid       default null,
  p_supplier_id             uuid       default null,
  p_supplier_order_id       uuid       default null,
  p_dinh_khoan_no           text       default null,
  p_dinh_khoan_co           text       default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id    uuid;
  v_expense_id uuid;
begin
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_create_expense_vn';
  end if;

  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'user not found for auth.uid()';
  end if;

  if p_is_chi_ho and (p_chi_ho_person is null or trim(p_chi_ho_person) = '') then
    raise exception 'chi_ho_person is required when is_chi_ho = true';
  end if;

  if p_is_intercompany and p_counterpart_company_id is null then
    raise exception 'counterpart_company_id is required when is_intercompany = true';
  end if;

  insert into expense_transactions (
    company_id, bank_account_id, region,
    txn_date, note,
    has_vat, vat_amount,
    is_chi_ho, chi_ho_person,
    expense_category, operation_id,
    amount_vnd,
    is_intercompany, counterpart_company_id,
    project_id, supplier_id, supplier_order_id,
    dinh_khoan_no, dinh_khoan_co,
    status, created_by
  ) values (
    p_company_id, p_bank_account_id, 'VN',
    p_txn_date, p_note,
    p_has_vat, coalesce(p_vat_amount, 0),
    p_is_chi_ho, p_chi_ho_person,
    p_expense_category, p_operation_id,
    p_amount_vnd,
    p_is_intercompany, p_counterpart_company_id,
    p_project_id, p_supplier_id, p_supplier_order_id,
    p_dinh_khoan_no, p_dinh_khoan_co,
    'draft', v_user_id
  )
  returning id into v_expense_id;

  if p_is_chi_ho then
    insert into internal_receivables (expense_id, person, amount)
    values (v_expense_id, p_chi_ho_person, p_amount_vnd);
  end if;

  return v_expense_id;
end;
$$;

grant execute on function kbit_create_expense_vn(
  uuid, uuid, date, numeric, text, boolean, numeric,
  boolean, text, text, uuid, boolean, uuid, uuid, uuid, uuid, text, text
) to authenticated;

-- ── (b2) kbit_create_expense_kr (gốc 0005) ──────────────────────────────────
drop function if exists kbit_create_expense_kr(
  uuid, uuid, numeric, numeric, date, expense_kind,
  uuid, boolean, numeric, text, uuid, boolean, uuid
);

create function kbit_create_expense_kr(
  p_company_id              uuid,
  p_bank_account_id         uuid,
  p_amount_krw              numeric,
  p_exchange_rate           numeric,
  p_txn_date                date,
  p_expense_kind            expense_kind,
  p_supplier_id             uuid       default null,
  p_has_vat                 boolean    default false,
  p_vat_amount              numeric    default 0,
  p_note                    text       default null,
  p_project_id              uuid       default null,
  p_is_intercompany         boolean    default false,
  p_counterpart_company_id  uuid       default null,
  p_dinh_khoan_no           text       default null,
  p_dinh_khoan_co           text       default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id    uuid;
  v_amount_vnd numeric;
  v_id         uuid;
begin
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_create_expense_kr';
  end if;

  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'THIEU_NGUOI_NHAP: user not found for auth.uid()';
  end if;

  if not (p_amount_krw > 0) then
    raise exception 'amount_krw phải > 0';
  end if;
  if not (p_exchange_rate > 0) then
    raise exception 'exchange_rate phải > 0';
  end if;

  if p_is_intercompany and p_counterpart_company_id is null then
    raise exception 'counterpart_company_id bắt buộc khi is_intercompany = true';
  end if;

  v_amount_vnd := round(p_amount_krw * p_exchange_rate);

  insert into expense_transactions (
    company_id, bank_account_id, supplier_id,
    region, expense_kind,
    amount_krw, exchange_rate, amount_vnd,
    txn_date, has_vat, vat_amount, note,
    project_id, is_intercompany, counterpart_company_id,
    dinh_khoan_no, dinh_khoan_co,
    created_by, status
  ) values (
    p_company_id, p_bank_account_id, p_supplier_id,
    'KR', p_expense_kind,
    p_amount_krw, p_exchange_rate, v_amount_vnd,
    p_txn_date, p_has_vat, coalesce(p_vat_amount, 0), p_note,
    p_project_id, p_is_intercompany, p_counterpart_company_id,
    p_dinh_khoan_no, p_dinh_khoan_co,
    v_user_id, 'draft'
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function kbit_create_expense_kr(
  uuid, uuid, numeric, numeric, date, expense_kind,
  uuid, boolean, numeric, text, uuid, boolean, uuid, text, text
) to authenticated;

-- ── (b3) kbit_pay_vn_supplier (gốc 0024) ────────────────────────────────────
drop function if exists kbit_pay_vn_supplier(uuid, uuid, numeric, date, text);

create function kbit_pay_vn_supplier(
  p_supplier_order_id uuid,
  p_bank_account_id   uuid,
  p_amount_vnd        numeric,
  p_txn_date          date,
  p_note              text default null,
  p_dinh_khoan_no     text default null,
  p_dinh_khoan_co     text default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id     uuid;
  v_company_id  uuid;
  v_supplier_id uuid;
  v_currency    currency_code;
  v_expense_id  uuid;
begin
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_pay_vn_supplier';
  end if;

  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'THIEU_NGUOI_NHAP: user not found for auth.uid()';
  end if;

  if not (p_amount_vnd > 0) then
    raise exception 'amount_vnd phải > 0';
  end if;

  select company_id, supplier_id, currency
    into v_company_id, v_supplier_id, v_currency
    from supplier_orders
   where id = p_supplier_order_id
     for update;

  if not found then
    raise exception 'Không tìm thấy đơn NCC: %', p_supplier_order_id;
  end if;
  if v_currency <> 'VND' then
    raise exception 'Đơn NCC không phải VNĐ (currency = %). Dùng chức năng trả NCC ngoại tệ (KRW).', v_currency;
  end if;

  perform 1 from bank_accounts where id = p_bank_account_id and company_id = v_company_id;
  if not found then
    raise exception 'Tài khoản chi không thuộc công ty của đơn NCC';
  end if;

  insert into expense_transactions (
    company_id, bank_account_id, supplier_id, supplier_order_id,
    region, amount_vnd, txn_date, note,
    dinh_khoan_no, dinh_khoan_co,
    created_by, status
  ) values (
    v_company_id, p_bank_account_id, v_supplier_id, p_supplier_order_id,
    'VN', p_amount_vnd, p_txn_date, p_note,
    p_dinh_khoan_no, p_dinh_khoan_co,
    v_user_id, 'draft'
  )
  returning id into v_expense_id;

  update supplier_orders
     set amount_paid = amount_paid + p_amount_vnd
   where id = p_supplier_order_id;

  return v_expense_id;
end;
$$;

grant execute on function kbit_pay_vn_supplier(uuid, uuid, numeric, date, text, text, text)
  to authenticated;

-- ── (b4) kbit_pay_kr_supplier (gốc 0005) ────────────────────────────────────
drop function if exists kbit_pay_kr_supplier(uuid, uuid, numeric, numeric, date, numeric, text);

create function kbit_pay_kr_supplier(
  p_supplier_order_id  uuid,
  p_bank_account_id    uuid,
  p_amount_krw         numeric,
  p_rate_settled       numeric,
  p_txn_date           date,
  p_rate_booked        numeric default null,
  p_note               text    default null,
  p_dinh_khoan_no      text    default null,
  p_dinh_khoan_co      text    default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id    uuid;
  v_company_id uuid;
  v_currency   currency_code;
  v_rate_booked numeric;
  v_amount_vnd  numeric;
  v_gain_loss   numeric;
  v_expense_id  uuid;
begin
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_pay_kr_supplier';
  end if;

  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'THIEU_NGUOI_NHAP: user not found for auth.uid()';
  end if;

  if not (p_amount_krw > 0) then
    raise exception 'amount_krw phải > 0';
  end if;
  if not (p_rate_settled > 0) then
    raise exception 'rate_settled phải > 0';
  end if;

  select company_id, currency, exchange_rate
    into v_company_id, v_currency, v_rate_booked
    from supplier_orders
   where id = p_supplier_order_id
     for update;

  if not found then
    raise exception 'Không tìm thấy đơn NCC: %', p_supplier_order_id;
  end if;

  if v_currency <> 'KRW' then
    raise exception 'Đơn NCC không phải ngoại tệ KRW (currency = %)', v_currency;
  end if;

  v_rate_booked := coalesce(v_rate_booked, p_rate_booked);
  if v_rate_booked is null or not (v_rate_booked > 0) then
    raise exception 'Thiếu rate_booked: đơn chưa có exchange_rate và không truyền p_rate_booked';
  end if;

  v_amount_vnd := round(p_amount_krw * p_rate_settled);
  v_gain_loss  := round(p_amount_krw * (v_rate_booked - p_rate_settled));

  insert into expense_transactions (
    company_id, bank_account_id, supplier_order_id,
    region, expense_kind,
    amount_krw, exchange_rate, amount_vnd,
    txn_date, note,
    dinh_khoan_no, dinh_khoan_co,
    created_by, status
  ) values (
    v_company_id, p_bank_account_id, p_supplier_order_id,
    'KR', 'goods',
    p_amount_krw, p_rate_settled, v_amount_vnd,
    p_txn_date, p_note,
    p_dinh_khoan_no, p_dinh_khoan_co,
    v_user_id, 'draft'
  )
  returning id into v_expense_id;

  update supplier_orders
     set amount_paid = amount_paid + p_amount_krw
   where id = p_supplier_order_id;

  insert into fx_gain_loss (
    ref_type, ref_id, currency,
    rate_booked, rate_settled, amount_fc, gain_loss_vnd
  ) values (
    'supplier_payment', p_supplier_order_id, 'KRW',
    v_rate_booked, p_rate_settled, p_amount_krw, v_gain_loss
  );

  return v_expense_id;
end;
$$;

grant execute on function kbit_pay_kr_supplier(
  uuid, uuid, numeric, numeric, date, numeric, text, text, text
) to authenticated;

-- ── (b5) kbit_record_income (gốc 0003) ──────────────────────────────────────
drop function if exists kbit_record_income(
  uuid, uuid, uuid, numeric, date, text, income_alloc_input[], uuid
);

create function kbit_record_income(
  p_company_id      uuid,
  p_bank_account_id uuid,
  p_customer_id     uuid,
  p_amount          numeric,
  p_txn_date        date,
  p_note            text,
  p_allocations     income_alloc_input[],
  p_project_id      uuid default null,
  p_dinh_khoan_no   text default null,
  p_dinh_khoan_co   text default null
)
returns uuid
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

  select currency into v_bank_currency from bank_accounts where id = p_bank_account_id;
  if v_bank_currency is null then
    raise exception 'Tài khoản ngân hàng % không tồn tại', p_bank_account_id;
  end if;

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

  insert into income_transactions(
    company_id, bank_account_id, customer_id, amount, txn_date,
    is_unassigned, note, status, created_by, currency, amount_vnd, project_id,
    dinh_khoan_no, dinh_khoan_co)
  values (
    p_company_id, p_bank_account_id, p_customer_id, p_amount, p_txn_date,
    (v_alloc_total = 0), p_note, 'confirmed',
    (select id from public.users where auth_id = auth.uid()),
    v_bank_currency,
    case when v_bank_currency = 'VND' then p_amount else null end,
    p_project_id,
    p_dinh_khoan_no, p_dinh_khoan_co)
  returning id into v_income_id;

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

  v_overpay := p_amount - v_alloc_total;
  if v_overpay > 0 and v_alloc_total > 0 then
    update customers set prepaid_balance = prepaid_balance + v_overpay
     where id = p_customer_id;
  end if;

  return v_income_id;
end $$;

revoke all on function kbit_record_income(uuid,uuid,uuid,numeric,date,text,income_alloc_input[],uuid,text,text) from public;
grant execute on function kbit_record_income(uuid,uuid,uuid,numeric,date,text,income_alloc_input[],uuid,text,text) to authenticated;
