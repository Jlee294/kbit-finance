-- 0038: Nới quyền duyệt (Anh Thịnh chốt)
--  (1) Giám đốc (CEO) có quyền DUYỆT giao dịch + KHÓA/MỞ KỲ (qua kbit_can_approve — kéo theo
--      RLS _w trên accounting_periods và các danh mục).
--  (2) Admin / Kế toán trưởng / Giám đốc được TỰ duyệt (người nhập = người duyệt);
--      kế toán thường vẫn phải có người khác duyệt.

-- (1) Thêm 'ceo' vào nhóm có quyền duyệt.
create or replace function kbit_can_approve() returns boolean
language sql stable as $$ select kbit_role() in ('admin','chief_accountant','ceo') $$;

-- (2) Thay hàm trigger duyệt — copy nguyên từ 0009, chỉ NỚI điều kiện tự duyệt.
create or replace function kbit_approval_guard()
returns trigger
language plpgsql
as $$
declare
  v_uid uuid := kbit_current_user_id();
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'confirmed') then
      raise exception
        'TT_KHOI_TAO_KHONG_HOP_LE: Giao dịch mới chỉ được tạo ở draft hoặc confirmed (nhận %).',
        new.status using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft'     and new.status in ('confirmed', 'void'))
      or (old.status = 'confirmed' and new.status in ('approved',  'draft', 'void'))
      or (old.status = 'approved'  and new.status = 'void')
      or (old.status = 'void'      and new.status = 'draft')
    ) then
      raise exception 'TT_CHUYEN_SAI: Không thể chuyển trạng thái % -> %.',
        old.status, new.status using errcode = 'P0001';
    end if;

    if new.status = 'approved' then
      if new.created_by is null then
        raise exception
          'THIEU_NGUOI_NHAP: Không thể duyệt giao dịch khuyết người nhập (created_by null).'
          using errcode = 'P0001';
      end if;
      if not kbit_can_approve() then
        raise exception
          'KHONG_DU_QUYEN_DUYET: Chỉ admin / kế toán trưởng / giám đốc được duyệt.'
          using errcode = 'P0001';
      end if;
      new.approved_by := kbit_current_user_id();
      if new.approved_by is null then
        raise exception
          'THIEU_NGUOI_DUYET: Không xác định được người duyệt (phiên đăng nhập hết hạn?).'
          using errcode = 'P0001';
      end if;
      -- NỚI: chỉ chặn TỰ duyệt với role thường; admin/chief_accountant/ceo được tự duyệt.
      if new.approved_by = new.created_by and kbit_role() not in ('admin','chief_accountant','ceo') then
        raise exception
          'NGUOI_NHAP_KHONG_DUOC_TU_DUYET: Người duyệt phải KHÁC người nhập.'
          using errcode = 'P0001';
      end if;

      insert into approval_requests(entity_type, entity_id, requested_by, approved_by, status, amount)
      values (
        tg_table_name, new.id, new.created_by, v_uid, 'approved',
        case tg_table_name
          when 'income_transactions'  then new.amount
          when 'expense_transactions' then new.amount_vnd
        end
      );
    end if;

    if old.status = 'approved' and new.status <> 'approved' then
      new.approved_by := null;
    end if;
  end if;

  return new;
end $$;
