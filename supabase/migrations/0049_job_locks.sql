-- =====================================================================
-- 0049 — M1: Lock chống chạy song song cho job admin (migrate-drive-folders)
-- =====================================================================
-- Vấn đề: /api/admin/migrate-drive-folders di chuyển hàng loạt file Drive,
-- maxDuration 300s, idempotent nhưng KHÔNG có khóa → 2 admin bấm cùng lúc
-- (hoặc bị spam) có thể chạy chồng, xáo trộn cây thư mục.
--
-- Giải pháp: bảng job_locks + RPC acquire/release có TTL (tự hết hạn nếu
-- job chết giữa chừng không release). Dùng được trên serverless (DB-based,
-- không phụ thuộc session như advisory lock).
-- =====================================================================

create table if not exists job_locks (
  lock_key    text primary key,
  acquired_at timestamptz not null default now(),
  acquired_by uuid references users(id),
  expires_at  timestamptz not null
);

alter table job_locks enable row level security;
-- Chỉ admin xem trạng thái lock (qua RPC là chính, nhưng để chắc)
drop policy if exists job_locks_sel on job_locks;
create policy job_locks_sel on job_locks
  for select using (kbit_role() = 'admin');

-- ── Acquire: trả true nếu chiếm được; false nếu đang có lock chưa hết hạn ──
create or replace function kbit_try_lock(p_key text, p_ttl_seconds int default 600)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_now timestamptz := now();
begin
  if kbit_role() <> 'admin' then
    raise exception 'Chỉ admin được lấy job lock';
  end if;

  -- Dọn lock đã hết hạn (job chết không release)
  delete from job_locks where expires_at < v_now;

  -- Thử chiếm
  insert into job_locks (lock_key, acquired_by, expires_at)
    values (p_key, (select id from users where auth_id = auth.uid()), v_now + make_interval(secs => p_ttl_seconds))
  on conflict (lock_key) do nothing;

  -- Chiếm được khi có dòng vừa insert (lock_key này, acquired_at vừa xong)
  return exists (
    select 1 from job_locks
    where lock_key = p_key and acquired_at >= v_now - interval '2 seconds'
  );
end $$;

-- ── Release ──────────────────────────────────────────────────────────────
create or replace function kbit_release_lock(p_key text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if kbit_role() <> 'admin' then
    raise exception 'Chỉ admin được nhả job lock';
  end if;
  delete from job_locks where lock_key = p_key;
end $$;

grant execute on function kbit_try_lock(text, int) to authenticated;
grant execute on function kbit_release_lock(text) to authenticated;

comment on table job_locks is 'M1 (0049): khóa chống chạy song song cho job admin nặng.';
