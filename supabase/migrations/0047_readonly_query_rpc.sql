-- =====================================================================
-- 0047 — KTT: RPC chạy SQL read-only cho chatbot (Cách B)
-- =====================================================================
-- Cho phép chatbot trả lời MỌI câu hỏi về dữ liệu bằng cách tự viết SELECT.
--
-- HÀNG RÀO AN TOÀN (xếp lớp):
--   1. SECURITY INVOKER — chạy với quyền của user đang đăng nhập → RLS áp dụng
--      đầy đủ (user chỉ thấy dữ liệu trong quyền của họ, giống như mở app).
--   2. Chỉ cho phép câu bắt đầu bằng SELECT hoặc WITH.
--   3. Block từ khóa nguy hiểm ở mọi vị trí (insert/update/delete/drop/...).
--   4. Block set_config (chống spoof request.jwt.claims → vượt RLS).
--   5. Block chấm phẩy giữa câu (chống multi-statement).
--   6. Block comment (-- và /*) — chống giấu từ khóa.
--   7. statement_timeout 5 giây — chống query nặng làm treo DB.
--   8. LIMIT 200 dòng ép từ ngoài — chống dump dữ liệu lớn.
-- =====================================================================

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
  -- Chuẩn hóa: bỏ khoảng trắng + chấm phẩy cuối
  v_sql := rtrim(trim(p_sql), '; ');

  if v_sql = '' then
    raise exception 'SQL rỗng';
  end if;

  -- (2) Chỉ SELECT / WITH
  if v_sql !~* '^\s*(select|with)\M' then
    raise exception 'Chỉ cho phép câu SELECT (hoặc WITH ... SELECT)';
  end if;

  -- (5) Chống multi-statement
  if position(';' in v_sql) > 0 then
    raise exception 'Không cho phép nhiều câu lệnh (;)';
  end if;

  -- (6) Chống comment giấu từ khóa
  if v_sql ~ '(--|/\*)' then
    raise exception 'Không cho phép comment trong SQL';
  end if;

  -- (3)+(4) Block từ khóa nguy hiểm (word-boundary nên updated_at/is_deleted vẫn dùng được)
  if v_sql ~* '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute|call|vacuum|reindex|cluster|listen|notify|prepare|deallocate|lock|comment|refresh|merge|import|set_config|pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink)\M' then
    raise exception 'SQL chứa từ khóa không được phép';
  end if;

  -- (7) Timeout 5s — set_config với is_local=true chỉ áp trong transaction này
  perform set_config('statement_timeout', '5000', true);

  -- (8) Bọc subquery + LIMIT 200, trả JSON
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (select * from (%s) q limit 200) t',
    v_sql
  ) into v_result;

  return v_result;
end $$;

-- Chỉ user đã đăng nhập gọi được (RLS của họ tự áp)
revoke all on function kbit_run_readonly_query(text) from public;
grant execute on function kbit_run_readonly_query(text) to authenticated;

comment on function kbit_run_readonly_query(text) is
  'KTT Cách B: chatbot chạy SELECT read-only. SECURITY INVOKER → RLS áp dụng. Timeout 5s, max 200 dòng.';
