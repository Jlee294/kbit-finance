-- ============ KBIT — KHÓA KỲ: chặn sửa giao dịch trong kỳ đã locked ============
-- Quy ước period = 'YYYY-MM' (khớp accounting_periods.period).
-- Tìm kỳ theo (company_id, to_char(date,'YYYY-MM')); nếu locked -> raise exception P0001.
-- Áp dụng 4 bảng: income_transactions (txn_date), expense_transactions (txn_date),
--   customer_orders (order_date), supplier_orders (order_date).
-- lockPeriod/unlockPeriod cập nhật accounting_periods trực tiếp — KHÔNG bị trigger này đụng.

-- ── Helper dùng chung ────────────────────────────────────────────────────────────
create or replace function kbit_assert_period_open(p_company_id uuid, p_date date)
returns void
language plpgsql
stable
as $$
declare
  v_status period_status;
  v_period text := to_char(p_date, 'YYYY-MM');
begin
  if p_company_id is null or p_date is null then
    return;  -- thiếu khoá kỳ thì không chặn ở đây (NOT NULL do bảng tự lo)
  end if;

  select status into v_status
  from accounting_periods
  where company_id = p_company_id and period = v_period;

  if v_status = 'locked' then
    raise exception
      'KY_DA_KHOA: Kỳ % của công ty này đã khóa, không thể thêm/sửa giao dịch ngày %.',
      v_period, p_date
      using errcode = 'P0001';
  end if;
end $$;

-- ── Trigger function: income & expense (cột ngày = txn_date) ────────────────────
create or replace function kbit_lock_guard_txndate()
returns trigger
language plpgsql
as $$
begin
  -- Chặn ngày MỚI thuộc kỳ đã khóa
  perform kbit_assert_period_open(new.company_id, new.txn_date);
  -- Chặn thêm: UPDATE dòng có ngày CŨ thuộc kỳ đã khóa (sửa nội dung trong kỳ khóa)
  if tg_op = 'UPDATE' then
    perform kbit_assert_period_open(old.company_id, old.txn_date);
  end if;
  return new;
end $$;

-- ── Trigger function: customer_orders & supplier_orders (cột ngày = order_date) ─
create or replace function kbit_lock_guard_orderdate()
returns trigger
language plpgsql
as $$
begin
  perform kbit_assert_period_open(new.company_id, new.order_date);
  if tg_op = 'UPDATE' then
    perform kbit_assert_period_open(old.company_id, old.order_date);
  end if;
  return new;
end $$;

-- ── Gắn trigger BEFORE INSERT OR UPDATE cho 4 bảng ──────────────────────────────
create trigger trg_income_lock
  before insert or update on income_transactions
  for each row execute function kbit_lock_guard_txndate();

create trigger trg_expense_lock
  before insert or update on expense_transactions
  for each row execute function kbit_lock_guard_txndate();

create trigger trg_corders_lock
  before insert or update on customer_orders
  for each row execute function kbit_lock_guard_orderdate();

-- D10/I2: supplier_orders cũng khóa theo order_date (giống customer_orders).
-- ⚠️ Ranh giới tạm: cộng amount_paid vào đơn NCC có order_date thuộc kỳ đã khóa
--    hiện BỊ CHẶN (vì UPDATE supplier_orders kiểm theo order_date của đơn).
--    Nếu cần trả công nợ đơn cũ sau khi khóa kỳ → Phase sau nới trigger
--    chỉ chặn khi order_date đổi hoặc đơn mới, bỏ chặn khi chỉ cập nhật amount_paid.
create trigger trg_sorders_lock
  before insert or update on supplier_orders
  for each row execute function kbit_lock_guard_orderdate();
