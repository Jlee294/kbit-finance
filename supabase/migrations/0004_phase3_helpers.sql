-- =====================================================================
-- Phase 3: Chi phí Việt Nam — 2 trục độc lập (VAT + Chi hộ)
-- 2 hàm RPC atomic:
--   kbit_create_expense_vn  — ghi expense + internal_receivable nếu chi hộ
--   kbit_collect_receivable — thu lại tiền chi hộ
-- NOTE: dùng SECURITY INVOKER để RLS vẫn hoạt động.
-- NOTE: kbit_current_user_id() chưa có (Phase 7); dùng inline subquery.
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. RPC: kbit_create_expense_vn
--    Trả về UUID của expense_transaction vừa tạo.
-- -----------------------------------------------------------------------
create or replace function kbit_create_expense_vn(
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
  p_supplier_order_id       uuid       default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id    uuid;
  v_expense_id uuid;
begin
  -- ── Kiểm tra quyền ──
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_create_expense_vn';
  end if;

  -- ── Lấy user nội bộ ──
  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'user not found for auth.uid()';
  end if;

  -- ── Validate chi hộ ──
  if p_is_chi_ho and (p_chi_ho_person is null or trim(p_chi_ho_person) = '') then
    raise exception 'chi_ho_person is required when is_chi_ho = true';
  end if;

  -- ── Validate nội bộ ──
  if p_is_intercompany and p_counterpart_company_id is null then
    raise exception 'counterpart_company_id is required when is_intercompany = true';
  end if;

  -- ── INSERT expense ──
  insert into expense_transactions (
    company_id, bank_account_id, region,
    txn_date, note,
    has_vat, vat_amount,
    is_chi_ho, chi_ho_person,
    expense_category, operation_id,
    amount_vnd,
    is_intercompany, counterpart_company_id,
    project_id, supplier_id, supplier_order_id,
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
    'draft', v_user_id
  )
  returning id into v_expense_id;

  -- ── Nếu chi hộ → tạo khoản phải thu ──
  if p_is_chi_ho then
    insert into internal_receivables (expense_id, person, amount)
    values (v_expense_id, p_chi_ho_person, p_amount_vnd);
  end if;

  return v_expense_id;
end;
$$;

-- -----------------------------------------------------------------------
-- 2. RPC: kbit_collect_receivable
--    Thu lại tiền chi hộ. Chỉ cập nhật internal_receivables (không ghi
--    income_transactions — ⏳ A9 pending).
--    Trả về true khi thành công.
-- -----------------------------------------------------------------------
create or replace function kbit_collect_receivable(
  p_receivable_id  uuid,
  p_collect_amount numeric
)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_rec record;
begin
  if not kbit_can_edit() then
    raise exception 'permission denied: kbit_collect_receivable';
  end if;

  select id, amount, collected_amount, status
  into v_rec
  from internal_receivables
  where id = p_receivable_id
  for update;

  if not found then
    raise exception 'receivable not found: %', p_receivable_id;
  end if;

  if v_rec.status = 'collected' then
    raise exception 'receivable already fully collected';
  end if;

  if p_collect_amount <= 0 then
    raise exception 'collect_amount must be > 0';
  end if;

  if (v_rec.collected_amount + p_collect_amount) > v_rec.amount then
    raise exception 'collect_amount (%) vượt quá số còn lại (%)',
      p_collect_amount, (v_rec.amount - v_rec.collected_amount);
  end if;

  update internal_receivables
  set
    collected_amount = collected_amount + p_collect_amount,
    status = case
               when (collected_amount + p_collect_amount) >= amount
               then 'collected'::receivable_status
               else 'outstanding'::receivable_status
             end,
    updated_at = now()
  where id = p_receivable_id;

  return true;
end;
$$;

-- -----------------------------------------------------------------------
-- Grant: accountant/chief_accountant có thể gọi 2 hàm này
-- (RLS của các bảng con sẽ tự chặn nếu role không đủ)
-- -----------------------------------------------------------------------
grant execute on function kbit_create_expense_vn(
  uuid, uuid, date, numeric, text, boolean, numeric,
  boolean, text, text, uuid,
  boolean, uuid, uuid, uuid, uuid
) to authenticated;

grant execute on function kbit_collect_receivable(uuid, numeric)
  to authenticated;
