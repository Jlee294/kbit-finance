-- ============ KBIT — BÁO CÁO DÒNG TIỀN + CÔNG NỢ + HỢP NHẤT ============
-- Quy ước (bám plan.md 3.8 + Phase 8 spec):
--   • Chỉ tính status IN ('confirmed','approved') — loại draft/void.
--   • Chi: loại is_chi_ho=true. Luôn dùng amount_vnd (đã quy VND ở Phase 4).
--   • Thu: theo income.currency (D13/I5). Hợp nhất: quy KRW→VND theo tỷ giá ngày giao dịch.
--   • Công nợ NCC (D3): outstanding NGUYÊN TỆ → quy VND qua supplier_orders.exchange_rate (đóng băng lúc ghi nợ).
--   • Loại trừ nội bộ (A4): CHỈ áp ở báo cáo HỢP NHẤT (kbit_report_consolidated).
--   • KHÔNG dùng chữ profit/loss/lai_lo — chỉ net_cash_flow / total_income / total_expense.

-- ── 1. Helper: tỷ giá tại 1 ngày (gần nhất ≤ ngày đó) ──────────────────────────
create or replace function kbit_rate_on(
  p_from currency_code,
  p_to   currency_code,
  p_date date
)
returns numeric
language sql stable as $$
  select case
    when p_from = p_to then 1::numeric
    else (
      select er.rate
      from exchange_rates er
      where er.currency_from = p_from
        and er.currency_to   = p_to
        and er.rate_date     <= p_date
      order by er.rate_date desc
      limit 1
    )
  end
$$;
-- NULL trả về = THIẾU tỷ giá → missing_rate=true → app phải cảnh báo, KHÔNG âm thầm bỏ qua.

-- ── 1b. Patch schema: income_transactions thiếu is_intercompany ─────────────────
-- (Đã có ở expense_transactions/customer_orders/supplier_orders từ init,
--  nhưng income_transactions bị bỏ sót — thêm bù ở đây, idempotent với IF NOT EXISTS)
alter table income_transactions
  add column if not exists is_intercompany boolean not null default false;

-- ── 2. VIEW dòng tiền từng pháp nhân (giữ nguyên đồng tiền gốc) ────────────────
-- Thu đã "thật" (confirmed/approved). income.currency = đồng tiền phiếu thu (D13/I5).
-- income GIỜ có project_id (D16/I8) → lọc được theo dự án.
create or replace view v_income_lines as
  select
    i.id,
    i.company_id,
    i.project_id,
    i.txn_date,
    i.amount,
    i.currency,
    i.is_intercompany
  from income_transactions i
  where i.status in ('confirmed', 'approved');

-- Chi đã "thật". LOẠI chi hộ (is_chi_ho=false). Luôn dùng amount_vnd.
-- expense GIỜ có project_id (D16/I8).
create or replace view v_expense_lines as
  select
    e.id,
    e.company_id,
    e.project_id,
    e.txn_date,
    e.amount_vnd,
    e.is_intercompany
  from expense_transactions e
  where e.status  in ('confirmed', 'approved')
    and e.is_chi_ho = false;

-- ── 3. RPC: báo cáo TỪNG pháp nhân ─────────────────────────────────────────────
-- Trả dòng tiền + công nợ theo base_currency công ty (KHÔNG quy đổi đa tệ ở đây).
-- p_company_id bắt buộc; p_project_id / p_from / p_to tùy chọn.
-- Lưu ý R3: net_cash_flow ở mức pháp nhân KR trộn thu KRW + chi VND → chỉ đúng tuyệt đối cho VN.
--   Bài toán đồng nhất tiền tệ giải triệt để ở kbit_report_consolidated.
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
  ar_outstanding numeric,   -- công nợ KH (phải thu), nguyên tệ theo base_currency công ty
  ap_outstanding numeric,   -- công nợ NCC (phải trả), quy base_currency qua supplier_orders.exchange_rate (D3)
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
  ar as (
    -- Công nợ KH: LOẠI đơn draft (I2 — fulfillment_status = 'draft' chưa phát sinh công nợ).
    select coalesce(sum(outstanding), 0) s
    from customer_orders
    where company_id          = p_company_id
      and fulfillment_status  <> 'draft'
      and (p_project_id is null or project_id = p_project_id)
      and (p_to is null or order_date <= p_to)
  ),
  ap as (
    -- Công nợ NCC (D3): outstanding NGUYÊN TỆ × exchange_rate (tỷ giá đóng băng lúc ghi nợ).
    -- Đơn VND: exchange_rate null hoặc 1 → coalesce(...,1).
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
  )
  select
    inc.s,
    exp.s,
    inc.s - exp.s,
    ar.s,
    ap.s,
    (select base_currency from companies where id = p_company_id)
  from inc, exp, ar, ap;
$$;

-- ── 4. RPC: báo cáo HỢP NHẤT Group ─────────────────────────────────────────────
-- Cộng MỌI pháp nhân; LOẠI is_intercompany=true (A4); quy đổi KRW→VND.
-- Scalar-subquery (D7/C7): luôn trả đúng 1 dòng kể cả khi bảng rỗng.
-- missing_rate=true → app PHẢI cảnh báo, KHÔNG ẩn.
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
  missing_rate       boolean    -- true = có dòng ngoại tệ thiếu tỷ giá
)
language sql stable as $$
  select
    -- THU: loại nội bộ; quy đổi theo income.currency tại ngày giao dịch (G1).
    (select coalesce(sum(
        i.amount * kbit_rate_on(i.currency, 'VND'::currency_code, i.txn_date)
      ), 0)
     from v_income_lines i
     where i.is_intercompany = false
       and (p_from is null or i.txn_date >= p_from)
       and (p_to   is null or i.txn_date <= p_to)
    ),

    -- CHI: loại nội bộ; amount_vnd đã VND → không quy lại (G2).
    (select coalesce(sum(e.amount_vnd), 0)
     from v_expense_lines e
     where e.is_intercompany = false
       and (p_from is null or e.txn_date >= p_from)
       and (p_to   is null or e.txn_date <= p_to)
    ),

    -- NET (lặp 2 subquery độc lập để giữ scalar — D7/C7)
    (select coalesce(sum(
        i.amount * kbit_rate_on(i.currency, 'VND'::currency_code, i.txn_date)
      ), 0)
     from v_income_lines i
     where i.is_intercompany = false
       and (p_from is null or i.txn_date >= p_from)
       and (p_to   is null or i.txn_date <= p_to)
    )
    - (select coalesce(sum(e.amount_vnd), 0)
       from v_expense_lines e
       where e.is_intercompany = false
         and (p_from is null or e.txn_date >= p_from)
         and (p_to   is null or e.txn_date <= p_to)
      ),

    -- CÔNG NỢ KH: loại nội bộ + LOẠI draft (I2); quy theo tỷ giá cuối kỳ (G2).
    (select coalesce(sum(
        co.outstanding
        * kbit_rate_on(c.base_currency, 'VND'::currency_code, coalesce(p_to, current_date))
      ), 0)
     from customer_orders co
     join companies c on c.id = co.company_id
     where co.is_intercompany = false
       and co.fulfillment_status <> 'draft'
       and (p_to is null or co.order_date <= p_to)
    ),

    -- CÔNG NỢ NCC (D3): outstanding NGUYÊN TỆ × exchange_rate đóng băng (G2).
    (select coalesce(sum(
        so.outstanding
        * case when so.currency = 'VND' then 1 else coalesce(so.exchange_rate, 1) end
      ), 0)
     from supplier_orders so
     where so.is_intercompany = false
       and (p_to is null or so.order_date <= p_to)
    ),

    -- MISSING_RATE: cờ thiếu tỷ giá ở thu phát sinh + công nợ KH cuối kỳ.
    (
      (select coalesce(bool_or(
          i.currency <> 'VND'
          and kbit_rate_on(i.currency, 'VND'::currency_code, i.txn_date) is null
        ), false)
       from v_income_lines i
       where i.is_intercompany = false
         and (p_from is null or i.txn_date >= p_from)
         and (p_to   is null or i.txn_date <= p_to)
      )
      or
      (select coalesce(bool_or(
          c.base_currency <> 'VND'
          and kbit_rate_on(c.base_currency, 'VND'::currency_code, coalesce(p_to, current_date)) is null
        ), false)
       from customer_orders co
       join companies c on c.id = co.company_id
       where co.is_intercompany = false
         and co.fulfillment_status <> 'draft'
         and (p_to is null or co.order_date <= p_to)
      )
    );
$$;

-- ── Grant ────────────────────────────────────────────────────────────────────────
grant execute on function kbit_rate_on(currency_code, currency_code, date) to anon, authenticated;
grant execute on function kbit_report_company(uuid, uuid, date, date)      to anon, authenticated;
grant execute on function kbit_report_consolidated(date, date)             to anon, authenticated;
grant select on v_income_lines  to anon, authenticated;
grant select on v_expense_lines to anon, authenticated;
