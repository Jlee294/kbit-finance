-- ============================================================
-- 0024 — (A) Trả công nợ NCC trong nước (VNĐ) atomic
--        (B) Chứng từ khác gắn đối tượng công nợ thật (KH/NCC)
-- ============================================================

-- ── (A) RPC kbit_pay_vn_supplier ────────────────────────────────────────────
-- Trả NCC VNĐ = 1 transaction atomic gồm 2 việc:
--   (1) Ghi phiếu chi (expense_transactions, region='VN', gắn supplier_order_id)
--   (2) Cộng supplier_orders.amount_paid (giảm công nợ phải trả)
-- Mẫu theo kbit_pay_kr_supplier (0005). Đơn KRW dùng hàm KR riêng.
create or replace function kbit_pay_vn_supplier(
  p_supplier_order_id uuid,
  p_bank_account_id   uuid,
  p_amount_vnd        numeric,
  p_txn_date          date,
  p_note              text default null
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
  -- Kiểm tra quyền
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_pay_vn_supplier';
  end if;

  -- Lấy user nội bộ
  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'THIEU_NGUOI_NHAP: user not found for auth.uid()';
  end if;

  if not (p_amount_vnd > 0) then
    raise exception 'amount_vnd phải > 0';
  end if;

  -- Khóa đơn NCC, đọc công ty / NCC / loại tiền
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

  -- Tài khoản chi phải thuộc đúng công ty của đơn (tránh lệch công ty)
  perform 1 from bank_accounts where id = p_bank_account_id and company_id = v_company_id;
  if not found then
    raise exception 'Tài khoản chi không thuộc công ty của đơn NCC';
  end if;

  -- (1) Ghi phiếu chi VNĐ
  insert into expense_transactions (
    company_id, bank_account_id, supplier_id, supplier_order_id,
    region, amount_vnd, txn_date, note,
    created_by, status
  ) values (
    v_company_id, p_bank_account_id, v_supplier_id, p_supplier_order_id,
    'VN', p_amount_vnd, p_txn_date, p_note,
    v_user_id, 'draft'
  )
  returning id into v_expense_id;

  -- (2) Cộng amount_paid (VNĐ) → outstanding (generated) tự giảm
  update supplier_orders
     set amount_paid = amount_paid + p_amount_vnd
   where id = p_supplier_order_id;

  return v_expense_id;
end;
$$;

grant execute on function kbit_pay_vn_supplier(uuid, uuid, numeric, date, text)
  to authenticated;

-- ── (B) cash_book gắn đối tượng công nợ thật ────────────────────────────────
-- Trước đây chỉ có doi_tac / ma_doi_tac (text gõ tay). Thêm FK để "Chứng từ khác"
-- đổ vào Công nợ: Thu → giảm phải thu (KH); Chi → giảm phải trả (NCC).
alter table cash_book
  add column if not exists customer_id uuid references customers(id),
  add column if not exists supplier_id uuid references suppliers(id);

-- Mỗi chứng từ chỉ gắn 1 phía (hoặc không gắn)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cash_book_party_one') then
    alter table cash_book add constraint cash_book_party_one
      check (customer_id is null or supplier_id is null);
  end if;
end $$;

create index if not exists idx_cb_customer on cash_book(customer_id) where customer_id is not null;
create index if not exists idx_cb_supplier on cash_book(supplier_id) where supplier_id is not null;
