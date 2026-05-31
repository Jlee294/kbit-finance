-- =====================================================================
-- Phase 4: Chi Hàn Quốc + Tỷ giá
-- 2 hàm RPC atomic (SECURITY INVOKER):
--   kbit_create_expense_kr  — ghi chi KR (quy đổi amount_vnd tự động)
--   kbit_pay_kr_supplier    — trả công nợ NCC KRW + amount_paid + fx_gain_loss
-- NOTE: kbit_current_user_id() chưa có (Phase 7); dùng inline subquery.
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. RPC: kbit_create_expense_kr
--    Ghi phiếu chi phát sinh tại Hàn Quốc (region='KR').
--    Tự tính amount_vnd = round(amount_krw × exchange_rate).
--    Ràng buộc chk_kr_fields (amount_krw + exchange_rate NOT NULL khi region='KR') được tôn trọng.
-- -----------------------------------------------------------------------
create or replace function kbit_create_expense_kr(
  -- tham số BẮT BUỘC (không có default) — phải đặt TRƯỚC
  p_company_id              uuid,
  p_bank_account_id         uuid,
  p_amount_krw              numeric,
  p_exchange_rate           numeric,
  p_txn_date                date,
  p_expense_kind            expense_kind,          -- 'goods' | 'service'
  -- tham số tuỳ chọn (có default) — phải đặt SAU
  p_supplier_id             uuid       default null,
  p_has_vat                 boolean    default false,
  p_vat_amount              numeric    default 0,
  p_note                    text       default null,
  p_project_id              uuid       default null,
  p_is_intercompany         boolean    default false,
  p_counterpart_company_id  uuid       default null
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
  -- ── Kiểm tra quyền ──
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_create_expense_kr';
  end if;

  -- ── Lấy user nội bộ (Phase 7 chưa có kbit_current_user_id) ──
  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'THIEU_NGUOI_NHAP: user not found for auth.uid()';
  end if;

  -- ── Validate số tiền ──
  if not (p_amount_krw > 0) then
    raise exception 'amount_krw phải > 0';
  end if;
  if not (p_exchange_rate > 0) then
    raise exception 'exchange_rate phải > 0';
  end if;

  -- ── Validate nội bộ ──
  if p_is_intercompany and p_counterpart_company_id is null then
    raise exception 'counterpart_company_id bắt buộc khi is_intercompany = true';
  end if;

  -- ── Tính VNĐ (làm tròn — VND không dùng phần lẻ) ──
  v_amount_vnd := round(p_amount_krw * p_exchange_rate);

  -- ── INSERT expense ──
  insert into expense_transactions (
    company_id, bank_account_id, supplier_id,
    region, expense_kind,
    amount_krw, exchange_rate, amount_vnd,
    txn_date, has_vat, vat_amount, note,
    project_id, is_intercompany, counterpart_company_id,
    created_by, status
  ) values (
    p_company_id, p_bank_account_id, p_supplier_id,
    'KR', p_expense_kind,
    p_amount_krw, p_exchange_rate, v_amount_vnd,
    p_txn_date, p_has_vat, coalesce(p_vat_amount, 0), p_note,
    p_project_id, p_is_intercompany, p_counterpart_company_id,
    v_user_id, 'draft'
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------
-- 2. RPC: kbit_pay_kr_supplier
--    Trả công nợ NCC ngoại tệ KRW = 1 transaction atomic gói 3 việc:
--      (1) Ghi phiếu chi KR (expense_transactions, region='KR')
--      (2) Cộng amount_paid theo KRW nguyên tệ (D3 — KHÔNG trộn VNĐ)
--      (3) Ghi chênh lệch tỷ giá (fx_gain_loss)
--    D4: rate_booked ĐỌC từ supplier_orders.exchange_rate; chỉ fallback p_rate_booked khi null.
--    Công thức: gain_loss_vnd = amount_fc × (rate_booked − rate_settled)  [dương=lãi, âm=lỗ]
-- -----------------------------------------------------------------------
create or replace function kbit_pay_kr_supplier(
  p_supplier_order_id  uuid,
  p_bank_account_id    uuid,
  p_amount_krw         numeric,        -- = amount_fc (số KRW trả lần này)
  p_rate_settled       numeric,        -- tỷ giá lúc trả
  p_txn_date           date,
  p_rate_booked        numeric default null,  -- fallback khi đơn chưa có exchange_rate
  p_note               text    default null
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
  -- ── Kiểm tra quyền ──
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_pay_kr_supplier';
  end if;

  -- ── Lấy user nội bộ ──
  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'THIEU_NGUOI_NHAP: user not found for auth.uid()';
  end if;

  -- ── Validate số tiền ──
  if not (p_amount_krw > 0) then
    raise exception 'amount_krw phải > 0';
  end if;
  if not (p_rate_settled > 0) then
    raise exception 'rate_settled phải > 0';
  end if;

  -- ── Khóa dòng đơn NCC, đọc rate_booked từ chính đơn (D4) ──
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

  -- D4: ưu tiên exchange_rate của đơn; fallback tham số khi đơn chưa có
  v_rate_booked := coalesce(v_rate_booked, p_rate_booked);
  if v_rate_booked is null or not (v_rate_booked > 0) then
    raise exception 'Thiếu rate_booked: đơn chưa có exchange_rate và không truyền p_rate_booked';
  end if;

  -- ── Tính tiền ──
  v_amount_vnd := round(p_amount_krw * p_rate_settled);
  -- gain_loss_vnd = amount_fc × (rate_booked − rate_settled) — dương=lãi, âm=lỗ
  v_gain_loss  := round(p_amount_krw * (v_rate_booked - p_rate_settled));

  -- ── (1) Ghi phiếu chi KR ──
  insert into expense_transactions (
    company_id, bank_account_id, supplier_order_id,
    region, expense_kind,
    amount_krw, exchange_rate, amount_vnd,
    txn_date, note,
    created_by, status
  ) values (
    v_company_id, p_bank_account_id, p_supplier_order_id,
    'KR', 'goods',
    p_amount_krw, p_rate_settled, v_amount_vnd,
    p_txn_date, p_note,
    v_user_id, 'draft'
  )
  returning id into v_expense_id;

  -- ── (2) Cộng amount_paid (D3: KRW nguyên tệ — KHÔNG trộn VNĐ) ──
  update supplier_orders
     set amount_paid = amount_paid + p_amount_krw
   where id = p_supplier_order_id;

  -- ── (3) Ghi chênh lệch tỷ giá ──
  insert into fx_gain_loss (
    ref_type, ref_id, currency,
    rate_booked, rate_settled, amount_fc, gain_loss_vnd
  ) values (
    'supplier_payment', p_supplier_order_id, 'KRW',
    v_rate_booked, p_rate_settled, p_amount_krw, v_gain_loss
  );

  -- 3 việc cùng 1 transaction → lỗi bất kỳ bước nào = rollback toàn bộ
  return v_expense_id;
end;
$$;

-- -----------------------------------------------------------------------
-- Grant: authenticated users có thể gọi (RLS + kbit_can_edit() tự chặn)
-- -----------------------------------------------------------------------
grant execute on function kbit_create_expense_kr(
  uuid, uuid, numeric, numeric, date, expense_kind,
  uuid, boolean, numeric, text, uuid, boolean, uuid
) to authenticated;

grant execute on function kbit_pay_kr_supplier(
  uuid, uuid, numeric, numeric, date, numeric, text
) to authenticated;

-- -----------------------------------------------------------------------
-- Seed test: 1 đơn NCC KRW để test chênh lệch tỷ giá
-- (Bỏ comment và thay <company_id>, <supplier_kr_id> bằng UUID thật nếu Phase 5 chưa có UI)
-- -----------------------------------------------------------------------
-- insert into supplier_orders (company_id, supplier_id, order_code, order_type, order_date, currency, goods_value, exchange_rate)
-- values ('<company_id>','<supplier_kr_id>','PO-KR-TEST-01','import','2026-05-01','KRW', 1000000, 18);
