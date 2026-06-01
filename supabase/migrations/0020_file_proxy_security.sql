-- ============================================================
-- 0020 — File proxy security (Cách 2: Drive private + Proxy endpoint)
-- ============================================================
-- Lưu drive_file_id riêng (thay vì parse từ URL) + audit log truy cập

-- Drive file ID (tách biệt với file_url để code clean hơn)
alter table documents
  add column if not exists drive_file_id text;

-- Index để lookup nhanh
create index if not exists idx_documents_drive_file_id
  on documents(drive_file_id) where drive_file_id is not null;

-- Migrate dữ liệu cũ: parse file ID từ URL `drive.google.com/file/d/{id}/view`
update documents
set drive_file_id = substring(file_url from '/file/d/([^/]+)')
where drive_file_id is null
  and file_url ilike '%drive.google.com%';

-- ── Audit log truy cập file ──────────────────────────────────────────────────
-- Mỗi lần user xem/tải file → ghi log. Phát hiện bất thường, compliance.
create table if not exists file_access_log (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  user_id      uuid references users(id),
  user_email   text,
  user_role    text,
  action       text not null check (action in ('view','download')),
  ip_address   text,
  user_agent   text,
  accessed_at  timestamptz not null default now()
);

create index if not exists idx_file_access_log_doc
  on file_access_log(document_id, accessed_at desc);
create index if not exists idx_file_access_log_user
  on file_access_log(user_id, accessed_at desc);

alter table file_access_log enable row level security;

drop policy if exists "fal_select_admin" on file_access_log;
drop policy if exists "fal_insert_authenticated" on file_access_log;

-- Admin xem được toàn bộ log; user thường chỉ thấy log của mình
create policy "fal_select_admin" on file_access_log
  for select using (
    kbit_role() in ('admin','chief_accountant')
    or user_id = (select id from users where auth_id = auth.uid())
  );

-- Mọi user authenticated đều insert được (qua proxy endpoint)
create policy "fal_insert_authenticated" on file_access_log
  for insert with check (auth.role() = 'authenticated');
