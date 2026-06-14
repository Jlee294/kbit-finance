-- =====================================================================
-- 0048 — SIẾT BẢO MẬT (security audit 2026-06)
-- =====================================================================
-- Khắc phục các lỗ hổng phát hiện khi rà soát:
--   C1 — Rò rỉ giá vốn qua chatbot / SQL read-only (mọi staff đọc được).
--        → Chỉ admin/ceo/chief_accountant (KTT) được xem giá vốn.
--   H1 — Tài liệu đính kèm (documents) mọi staff đọc được mọi file.
--        → Chỉ admin/ceo/chief_accountant xem.
--   M2 — query_database (RPC chatbot) chặn pg_catalog/information_schema
--        + chặn cột giá vốn cho user không đủ quyền.
-- =====================================================================

-- ── Helper: ai được xem GIÁ VỐN (KTT chốt: admin + CEO + Kế toán trưởng) ──
create or replace function kbit_can_view_costs() returns boolean
language sql stable as $$
  select kbit_role() in ('admin', 'ceo', 'chief_accountant')
$$;

-- ─────────────────────────────────────────────────────────────────────
-- C1 — Bảng cache giá vốn: SELECT chỉ cho cost-viewer
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists pmc_sel on product_moving_cost;
create policy pmc_sel on product_moving_cost
  for select to authenticated
  using (kbit_can_view_costs());

-- inventory_cost_periods: thẻ giá vốn theo kỳ (value_open/in/out/close, avg_unit_cost)
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'inventory_cost_periods') then
    execute 'alter table inventory_cost_periods enable row level security';
    execute 'drop policy if exists icp_sel on inventory_cost_periods';
    execute 'create policy icp_sel on inventory_cost_periods for select to authenticated using (kbit_can_view_costs())';
    -- ghi: chỉ qua RPC security definer (đã guard), nhưng để chắc — cost-viewer mới ghi tay
    execute 'drop policy if exists icp_ins on inventory_cost_periods';
    execute 'create policy icp_ins on inventory_cost_periods for insert to authenticated with check (kbit_can_view_costs())';
    execute 'drop policy if exists icp_upd on inventory_cost_periods';
    execute 'create policy icp_upd on inventory_cost_periods for update to authenticated using (kbit_can_view_costs())';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- H1 — documents: chỉ admin/ceo/chief_accountant xem (trước: mọi staff)
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists documents_sel on documents;
create policy documents_sel on documents
  for select
  using (kbit_role() in ('admin', 'ceo', 'chief_accountant'));

-- file_access_log: cùng mức (log truy cập file là dữ liệu nhạy cảm)
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'file_access_log') then
    execute 'drop policy if exists file_access_log_sel on file_access_log';
    execute 'create policy file_access_log_sel on file_access_log for select using (kbit_role() in (''admin'',''ceo'',''chief_accountant''))';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- M2 — Siết RPC kbit_run_readonly_query
--   + Chặn pg_catalog / information_schema (do thám schema)
--   + Chặn cột giá vốn nếu user KHÔNG phải cost-viewer (hard control,
--     không phụ thuộc LLM tự giác)
-- ─────────────────────────────────────────────────────────────────────
create or replace function kbit_run_readonly_query(p_sql text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sql    text;
  v_result jsonb;
begin
  v_sql := rtrim(trim(p_sql), '; ');

  if v_sql = '' then
    raise exception 'SQL rỗng';
  end if;
  if v_sql !~* '^\s*(select|with)\M' then
    raise exception 'Chỉ cho phép câu SELECT (hoặc WITH ... SELECT)';
  end if;
  if position(';' in v_sql) > 0 then
    raise exception 'Không cho phép nhiều câu lệnh (;)';
  end if;
  if v_sql ~ '(--|/\*)' then
    raise exception 'Không cho phép comment trong SQL';
  end if;
  if v_sql ~* '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute|call|vacuum|reindex|cluster|listen|notify|prepare|deallocate|lock|comment|refresh|merge|import|set_config|pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink)\M' then
    raise exception 'SQL chứa từ khóa không được phép';
  end if;

  -- M2: chặn do thám catalog (RLS không áp lên system catalog)
  if v_sql ~* '\m(pg_catalog|information_schema|pg_class|pg_attribute|pg_namespace|pg_roles|pg_user|pg_shadow|pg_authid|pg_proc)\M' then
    raise exception 'Không cho phép truy vấn system catalog';
  end if;

  -- C1/M2: chặn cột GIÁ VỐN nếu user không đủ quyền (hard control)
  if not kbit_can_view_costs() then
    if v_sql ~* '\m(unit_cost|cost_price|avg_cost|avg_unit_cost|value_open|value_in|value_out|value_close|cost_total|product_moving_cost|inventory_cost_periods)\M' then
      raise exception 'Bạn không có quyền xem dữ liệu giá vốn';
    end if;
  end if;

  perform set_config('statement_timeout', '5000', true);

  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (select * from (%s) q limit 200) t',
    v_sql
  ) into v_result;

  return v_result;
end $$;

revoke all on function kbit_run_readonly_query(text) from public;
grant execute on function kbit_run_readonly_query(text) to authenticated;

comment on function kbit_can_view_costs() is
  'Security 0048: ai được xem giá vốn — admin/ceo/chief_accountant (KTT chốt).';
