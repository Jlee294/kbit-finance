-- =====================================================================
-- 0051 — SIẾT WRITE THEO CÔNG TY (company-scoped writes)
-- =====================================================================
-- Bổ sung cho 0050 (đã scope READ). Nay scope WRITE để accountant gán
-- công ty A KHÔNG ghi được dữ liệu công ty B (kể cả gọi API trực tiếp).
--
-- 2 đường ghi:
--   (a) Ghi thẳng bảng + RPC SECURITY INVOKER → table write policy áp dụng.
--       → Thêm kbit_can_access_company(company_id) vào INSERT/UPDATE policy.
--       Áp cho bảng mà kbit_can_edit (gồm accountant) ghi được + có company_id:
--       customer_orders, supplier_orders, income_transactions,
--       expense_transactions, cash_book, warehouse_transactions.
--       (Bảng master như projects/bank_accounts/tax_* chỉ kbit_can_approve =
--        admin/ceo/KTT ghi — nhóm này see-all nên không cần scope.)
--   (b) RPC kho SECURITY DEFINER (kbit_receive_stock/issue/deduct/adjust/
--       set_opening) bypass RLS → MỌI đường đều gọi 2 helper mc_receive/
--       mc_issue (nhận company_id). Guard 2 hàm này = guard toàn bộ ghi kho.
--
-- Giữ nguyên check role cũ (kbit_can_edit) — chỉ AND thêm company access.
-- admin/ceo/chief_accountant: kbit_can_access_company() luôn true → không đổi.
-- =====================================================================

-- ── (a) Table write policies — thêm company scope ─────────────────────

-- customer_orders
drop policy if exists customer_orders_ins on customer_orders;
create policy customer_orders_ins on customer_orders
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
drop policy if exists customer_orders_upd on customer_orders;
create policy customer_orders_upd on customer_orders
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
            with check (kbit_can_edit() and kbit_can_access_company(company_id));

-- supplier_orders
drop policy if exists supplier_orders_ins on supplier_orders;
create policy supplier_orders_ins on supplier_orders
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
drop policy if exists supplier_orders_upd on supplier_orders;
create policy supplier_orders_upd on supplier_orders
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
            with check (kbit_can_edit() and kbit_can_access_company(company_id));

-- income_transactions (RPC kbit_record_income là INVOKER → policy áp dụng)
drop policy if exists income_transactions_ins on income_transactions;
create policy income_transactions_ins on income_transactions
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
drop policy if exists income_transactions_upd on income_transactions;
create policy income_transactions_upd on income_transactions
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
            with check (kbit_can_edit() and kbit_can_access_company(company_id));

-- expense_transactions (RPC ghi chi/thu, pay_vn_supplier đều INVOKER)
drop policy if exists expense_transactions_ins on expense_transactions;
create policy expense_transactions_ins on expense_transactions
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
drop policy if exists expense_transactions_upd on expense_transactions;
create policy expense_transactions_upd on expense_transactions
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
            with check (kbit_can_edit() and kbit_can_access_company(company_id));

-- cash_book (cb_insert/cb_update, 0016)
drop policy if exists "cb_insert" on cash_book;
create policy "cb_insert" on cash_book
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));
drop policy if exists "cb_update" on cash_book;
create policy "cb_update" on cash_book
  for update using (kbit_can_edit() and kbit_can_access_company(company_id))
            with check (kbit_can_edit() and kbit_can_access_company(company_id));

-- warehouse_transactions (direct write hiếm; RPC bypass nhưng vẫn defense)
drop policy if exists wtxn_ins on warehouse_transactions;
create policy wtxn_ins on warehouse_transactions
  for insert with check (kbit_can_edit() and kbit_can_access_company(company_id));

-- ── (b) Guard 2 helper kho (mọi RPC kho đều gọi qua đây) ──────────────
-- Re-create đúng body 0033 + 1 dòng assert company-access ở đầu.

create or replace function kbit_mc_receive(p_company_id uuid, p_product_id uuid, p_qty numeric, p_unit_cost numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0; v_u numeric; v_newqty numeric; v_newavg numeric;
begin
  -- Security 0051: chặn ghi kho cho công ty user không được phép
  if not kbit_can_access_company(p_company_id) then
    raise exception 'Không có quyền ghi kho cho công ty này' using errcode = 'P0001';
  end if;
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost
    where company_id = p_company_id and product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  v_u := coalesce(p_unit_cost, v_avg);
  v_newqty := v_qty + p_qty;
  v_newavg := case when v_qty > 0 then round((v_qty*v_avg + p_qty*v_u)/(v_qty+p_qty), 2) else round(v_u, 2) end;
  insert into product_moving_cost(company_id, product_id, qty_on_hand, avg_cost, updated_at)
    values (p_company_id, p_product_id, v_newqty, v_newavg, now())
  on conflict (company_id, product_id) do update set qty_on_hand = v_newqty, avg_cost = v_newavg, updated_at = now();
  return round(v_u, 2);
end $$;

create or replace function kbit_mc_issue(p_company_id uuid, p_product_id uuid, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0;
begin
  -- Security 0051: chặn ghi kho cho công ty user không được phép
  if not kbit_can_access_company(p_company_id) then
    raise exception 'Không có quyền ghi kho cho công ty này' using errcode = 'P0001';
  end if;
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost
    where company_id = p_company_id and product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  insert into product_moving_cost(company_id, product_id, qty_on_hand, avg_cost, updated_at)
    values (p_company_id, p_product_id, v_qty - p_qty, v_avg, now())
  on conflict (company_id, product_id) do update set qty_on_hand = v_qty - p_qty, updated_at = now();
  return round(v_avg, 2);
end $$;
