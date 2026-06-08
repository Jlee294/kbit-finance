-- =====================================================================
-- 0040 — Đưa "Chứng từ khác" (cash_book) vào BÁO CÁO dòng tiền + công nợ
--
-- E (Anh Thịnh chốt): cash_book thu → total_income; chi → total_expense.
--    Chỉ tính status='confirmed'; chỉ khi KHÔNG lọc theo dự án (cash_book không
--    gắn dự án) — khớp cách income/expense lọc theo project.
-- B: cash_book gắn KH/NCC điều chỉnh ar/ap_outstanding để KHỚP trang Công nợ
--    (getReceivableLedger/getPayableLedger). Quy ước = cashEntryToLedgerSource:
--    AR (phải thu): thu → giảm, chi → tăng.   AP (phải trả): chi → giảm, thu → tăng.
--
-- create or replace: GIỮ NGUYÊN chữ ký 2 RPC (0010), chỉ đổi thân. Grant cũ giữ nguyên.
-- cash_book trước nay mặc định 'draft' nhưng KHÔNG có luồng duyệt (chỉ insert/update)
--   → status là default kỹ thuật, không phải trạng thái nghiệp vụ. Đưa các bản ghi cũ
--   về 'confirmed' để chúng vào báo cáo (app từ nay tạo cash_book = 'confirmed').
-- =====================================================================

-- ── (0) cash_book hiện có → confirmed (để vào báo cáo; không có luồng duyệt) ──
update cash_book set status = 'confirmed' where status = 'draft';

-- ── (1) Báo cáo TỪNG pháp nhân ───────────────────────────────────────────────
create or replace function kbit_report_company(
  p_company_id uuid,
  p_project_id uuid    default null,
  p_from       date    default null,
  p_to         date    default null
)
returns table (
  total_income   numeric,
  total_expense  numeric,
  net_cash_flow  numeric,
  ar_outstanding numeric,
  ap_outstanding numeric,
  currency       currency_code
)
language sql stable as $$
  with
  inc as (
    select coalesce(sum(amount), 0) s
    from v_income_lines
    where company_id  = p_company_id
      and (p_project_id is null or project_id = p_project_id)
      and (p_from is null or txn_date >= p_from)
      and (p_to   is null or txn_date <= p_to)
  ),
  exp as (
    select coalesce(sum(amount_vnd), 0) s
    from v_expense_lines
    where company_id  = p_company_id
      and (p_project_id is null or project_id = p_project_id)
      and (p_from is null or txn_date >= p_from)
      and (p_to   is null or txn_date <= p_to)
  ),
  -- E: tiền mặt linh tinh (cash_book) — chỉ confirmed, chỉ khi KHÔNG lọc dự án.
  cash_inc as (
    select coalesce(sum(so_tien), 0) s
    from cash_book
    where company_id = p_company_id and direction = 'thu' and status = 'confirmed'
      and p_project_id is null
      and (p_from is null or txn_date >= p_from)
      and (p_to   is null or txn_date <= p_to)
  ),
  cash_exp as (
    select coalesce(sum(so_tien), 0) s
    from cash_book
    where company_id = p_company_id and direction = 'chi' and status = 'confirmed'
      and p_project_id is null
      and (p_from is null or txn_date >= p_from)
      and (p_to   is null or txn_date <= p_to)
  ),
  ar as (
    select coalesce(sum(outstanding), 0) s
    from customer_orders
    where company_id          = p_company_id
      and fulfillment_status  <> 'draft'
      and (p_project_id is null or project_id = p_project_id)
      and (p_to is null or order_date <= p_to)
  ),
  -- B: điều chỉnh phải thu KH từ cash_book gắn KH (thu giảm, chi tăng).
  cash_ar as (
    select coalesce(sum(case when direction = 'thu' then -so_tien else so_tien end), 0) s
    from cash_book
    where company_id = p_company_id and customer_id is not null and status = 'confirmed'
      and p_project_id is null
      and (p_to is null or txn_date <= p_to)
  ),
  ap as (
    select coalesce(sum(
      outstanding * case
        when so.currency = (select base_currency from companies where id = p_company_id)
          then 1
        else coalesce(so.exchange_rate, 1)
      end
    ), 0) s
    from supplier_orders so
    where so.company_id = p_company_id
      and (p_project_id is null or so.project_id = p_project_id)
      and (p_to is null or so.order_date <= p_to)
  ),
  -- B: điều chỉnh phải trả NCC từ cash_book gắn NCC (chi giảm, thu tăng).
  cash_ap as (
    select coalesce(sum(case when direction = 'chi' then -so_tien else so_tien end), 0) s
    from cash_book
    where company_id = p_company_id and supplier_id is not null and status = 'confirmed'
      and p_project_id is null
      and (p_to is null or txn_date <= p_to)
  )
  select
    inc.s + cash_inc.s,
    exp.s + cash_exp.s,
    (inc.s + cash_inc.s) - (exp.s + cash_exp.s),
    ar.s + cash_ar.s,
    ap.s + cash_ap.s,
    (select base_currency from companies where id = p_company_id)
  from inc, exp, cash_inc, cash_exp, ar, cash_ar, ap, cash_ap;
$$;

-- ── (2) Báo cáo HỢP NHẤT ─────────────────────────────────────────────────────
-- cash_book quy đổi sang VND theo base_currency công ty (qua kbit_rate_on, như income/orders).
-- KHÔNG có cờ is_intercompany → tính tất.
create or replace function kbit_report_consolidated(
  p_from date default null,
  p_to   date default null
)
returns table (
  total_income_vnd   numeric,
  total_expense_vnd  numeric,
  net_cash_flow_vnd  numeric,
  ar_outstanding_vnd numeric,
  ap_outstanding_vnd numeric,
  missing_rate       boolean
)
language sql stable as $$
  select
    -- THU = income (quy đổi) + cash_book thu (VND)
    (select coalesce(sum(i.amount * kbit_rate_on(i.currency, 'VND'::currency_code, i.txn_date)), 0)
     from v_income_lines i where i.is_intercompany = false
       and (p_from is null or i.txn_date >= p_from) and (p_to is null or i.txn_date <= p_to))
    + (select coalesce(sum(cb.so_tien * kbit_rate_on(co.base_currency, 'VND'::currency_code, cb.txn_date)), 0)
       from cash_book cb join companies co on co.id = cb.company_id
       where cb.direction = 'thu' and cb.status = 'confirmed'
         and (p_from is null or cb.txn_date >= p_from) and (p_to is null or cb.txn_date <= p_to)),

    -- CHI = expense + cash_book chi (VND)
    (select coalesce(sum(e.amount_vnd), 0) from v_expense_lines e where e.is_intercompany = false
       and (p_from is null or e.txn_date >= p_from) and (p_to is null or e.txn_date <= p_to))
    + (select coalesce(sum(cb.so_tien * kbit_rate_on(co.base_currency, 'VND'::currency_code, cb.txn_date)), 0)
       from cash_book cb join companies co on co.id = cb.company_id
       where cb.direction = 'chi' and cb.status = 'confirmed'
         and (p_from is null or cb.txn_date >= p_from) and (p_to is null or cb.txn_date <= p_to)),

    -- NET = (income + cash thu) − (expense + cash chi)
    ( (select coalesce(sum(i.amount * kbit_rate_on(i.currency, 'VND'::currency_code, i.txn_date)), 0)
       from v_income_lines i where i.is_intercompany = false
         and (p_from is null or i.txn_date >= p_from) and (p_to is null or i.txn_date <= p_to))
      + (select coalesce(sum(cb.so_tien * kbit_rate_on(co.base_currency, 'VND'::currency_code, cb.txn_date)), 0)
         from cash_book cb join companies co on co.id = cb.company_id
         where cb.direction = 'thu' and cb.status = 'confirmed'
           and (p_from is null or cb.txn_date >= p_from) and (p_to is null or cb.txn_date <= p_to))
    ) - (
      (select coalesce(sum(e.amount_vnd), 0) from v_expense_lines e where e.is_intercompany = false
         and (p_from is null or e.txn_date >= p_from) and (p_to is null or e.txn_date <= p_to))
      + (select coalesce(sum(cb.so_tien * kbit_rate_on(co.base_currency, 'VND'::currency_code, cb.txn_date)), 0)
         from cash_book cb join companies co on co.id = cb.company_id
         where cb.direction = 'chi' and cb.status = 'confirmed'
           and (p_from is null or cb.txn_date >= p_from) and (p_to is null or cb.txn_date <= p_to))
    ),

    -- AR = customer_orders + cash_book gắn KH (thu giảm, chi tăng).
    --   cash_book quy đổi theo base_currency công ty, tỷ giá cuối kỳ (như orders).
    (select coalesce(sum(
        co.outstanding * kbit_rate_on(c.base_currency, 'VND'::currency_code, coalesce(p_to, current_date))
      ), 0)
     from customer_orders co join companies c on c.id = co.company_id
     where co.is_intercompany = false and co.fulfillment_status <> 'draft'
       and (p_to is null or co.order_date <= p_to))
    + (select coalesce(sum((case when cb.direction = 'thu' then -cb.so_tien else cb.so_tien end)
         * kbit_rate_on(co.base_currency, 'VND'::currency_code, coalesce(p_to, current_date))), 0)
       from cash_book cb join companies co on co.id = cb.company_id
       where cb.customer_id is not null and cb.status = 'confirmed'
         and (p_to is null or cb.txn_date <= p_to)),

    -- AP = supplier_orders + cash_book gắn NCC (chi giảm, thu tăng).
    (select coalesce(sum(
        so.outstanding * case when so.currency = 'VND' then 1 else coalesce(so.exchange_rate, 1) end
      ), 0)
     from supplier_orders so where so.is_intercompany = false and (p_to is null or so.order_date <= p_to))
    + (select coalesce(sum((case when cb.direction = 'chi' then -cb.so_tien else cb.so_tien end)
         * kbit_rate_on(co.base_currency, 'VND'::currency_code, coalesce(p_to, current_date))), 0)
       from cash_book cb join companies co on co.id = cb.company_id
       where cb.supplier_id is not null and cb.status = 'confirmed'
         and (p_to is null or cb.txn_date <= p_to)),

    -- MISSING_RATE: giữ nguyên (cash_book là VND, không ảnh hưởng cờ thiếu tỷ giá).
    (
      (select coalesce(bool_or(
          i.currency <> 'VND' and kbit_rate_on(i.currency, 'VND'::currency_code, i.txn_date) is null
        ), false)
       from v_income_lines i where i.is_intercompany = false
         and (p_from is null or i.txn_date >= p_from) and (p_to is null or i.txn_date <= p_to))
      or
      (select coalesce(bool_or(
          c.base_currency <> 'VND' and kbit_rate_on(c.base_currency, 'VND'::currency_code, coalesce(p_to, current_date)) is null
        ), false)
       from customer_orders co join companies c on c.id = co.company_id
       where co.is_intercompany = false and co.fulfillment_status <> 'draft'
         and (p_to is null or co.order_date <= p_to))
    );
$$;
