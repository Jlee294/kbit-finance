-- ============ KBIT — DUYỆT 1 CẤP: tách người duyệt + kiểm soát chuyển trạng thái ============
-- Cưỡng chế ở DB (trigger BEFORE), không dựa app.
-- Luồng hợp lệ: draft ↔ confirmed → approved → void (và draft → void).
-- D5/C5: INSERT cho phép 'draft' HOẶC 'confirmed' (RPC thu Phase 2 tạo income 'confirmed').
-- Người duyệt (approved_by) bị ĐÈ bởi trigger = người đang đăng nhập → chống giả mạo.

-- ── Helper: map auth.uid() → users.id ───────────────────────────────────────────
create or replace function kbit_current_user_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid() and is_active = true
$$;

-- ── [⏳ A5] Ngưỡng khoản lớn cần 2 cấp duyệt ───────────────────────────────────
-- NULL = tắt (1 cấp cho mọi khoản — giả định tạm plan.md mục 7).
-- Khi chốt A5: đổi null thành số tiền ngưỡng để bật nhánh 2 cấp.
create or replace function kbit_two_level_threshold()
returns numeric
language sql immutable as $$ select null::numeric $$;

-- ── Trigger function chính ───────────────────────────────────────────────────────
create or replace function kbit_approval_guard()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := kbit_current_user_id();
begin
  -- ── INSERT ──────────────────────────────────────────────────────────────────
  -- D5/C5: cho phép tạo ở 'draft' HOẶC 'confirmed'. Cấm tạo thẳng 'approved'/'void'.
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'confirmed') then
      raise exception
        'TT_KHOI_TAO_KHONG_HOP_LE: Giao dịch mới chỉ được tạo ở draft hoặc confirmed (nhận %).',
        new.status
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- ── UPDATE ───────────────────────────────────────────────────────────────────
  if new.status is distinct from old.status then

    -- Kiểm luồng chuyển hợp lệ
    if not (
         (old.status = 'draft'     and new.status in ('confirmed', 'void'))
      or (old.status = 'confirmed' and new.status in ('approved',  'draft', 'void'))
      or (old.status = 'approved'  and new.status = 'void')
      or (old.status = 'void'      and new.status = 'draft')
    ) then
      raise exception 'TT_CHUYEN_SAI: Không thể chuyển trạng thái % -> %.',
        old.status, new.status
        using errcode = 'P0001';
    end if;

    -- Khi DUYỆT (→ approved): cưỡng chế quyền + tách người
    if new.status = 'approved' then
      if new.created_by is null then
        raise exception
          'THIEU_NGUOI_NHAP: Không thể duyệt giao dịch khuyết người nhập (created_by null).'
          using errcode = 'P0001';
      end if;
      if not kbit_can_approve() then
        raise exception
          'KHONG_DU_QUYEN_DUYET: Chỉ admin/chief_accountant được duyệt.'
          using errcode = 'P0001';
      end if;
      -- Đè người duyệt = người đang đăng nhập (chống giả mạo approved_by từ app)
      new.approved_by := kbit_current_user_id();
      if new.approved_by is null then
        raise exception
          'THIEU_NGUOI_DUYET: Không xác định được người duyệt (phiên đăng nhập hết hạn?).'
          using errcode = 'P0001';
      end if;
      if new.approved_by = new.created_by then
        raise exception
          'NGUOI_NHAP_KHONG_DUOC_TU_DUYET: Người duyệt phải KHÁC người nhập.'
          using errcode = 'P0001';
      end if;

      -- [⏳ A5] Lưu vết duyệt vào approval_requests (giữ amount để sau lọc khoản lớn)
      insert into approval_requests(entity_type, entity_id, requested_by, approved_by, status, amount)
      values (
        tg_table_name,
        new.id,
        new.created_by,
        v_uid,
        'approved',
        case tg_table_name
          when 'income_transactions'  then new.amount
          when 'expense_transactions' then new.amount_vnd
        end
      );
      -- KHI CHỐT A5: nếu amount >= kbit_two_level_threshold() và đây mới là cấp 1
      --   → KHÔNG cho new.status='approved' ngay, set 'confirmed' + tạo approval_requests 'pending'
      --     chờ cấp 2 (người thứ 3) duyệt. (chưa bật: threshold = NULL)
    end if;

    -- Rời 'approved' (→ void): xóa dấu người duyệt cũ
    if old.status = 'approved' and new.status <> 'approved' then
      new.approved_by := null;
    end if;

  end if;

  return new;
end $$;

-- ── Gắn trigger BEFORE INSERT OR UPDATE cho income & expense ────────────────────
create trigger trg_income_approval
  before insert or update on income_transactions
  for each row execute function kbit_approval_guard();

create trigger trg_expense_approval
  before insert or update on expense_transactions
  for each row execute function kbit_approval_guard();

-- ── Grant execute cho anon/authenticated (để RLS client dùng được) ──────────────
grant execute on function kbit_current_user_id()      to anon, authenticated;
grant execute on function kbit_two_level_threshold()  to anon, authenticated;
grant execute on function kbit_assert_period_open(uuid, date) to anon, authenticated;
