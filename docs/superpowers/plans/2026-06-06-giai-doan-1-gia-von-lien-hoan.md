# Giai đoạn 1 — Nền giá vốn bình quân LIÊN HOÀN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đổi cách tính giá vốn kho từ bình quân CUỐI KỲ (0028) sang bình quân LIÊN HOÀN (moving average) trên toàn hệ thống — giá vốn & lãi gộp có ngay realtime, không chờ chốt kỳ.

**Architecture:** Sổ cái `warehouse_transactions` là nguồn sự thật duy nhất (thêm loại `opening` cho số dư đầu kỳ). Bảng cache `product_moving_cost` giữ (tổng tồn + đơn giá BQ hiện hành) theo MÃ. Mọi RPC kho cập nhật cache theo công thức liên hoàn và ghi `unit_cost` vào từng dòng sổ tại thời điểm phát sinh. "Chốt kỳ" đổi vai trò thành KHÓA SỔ: chỉ chụp ảnh số liệu từ sổ (cộng dồn), không tính lại giá → bảo toàn đẳng thức Đầu+Nhập=Xuất+Cuối.

**Tech Stack:** PostgreSQL (Supabase migrations, plpgsql), TypeScript/Next.js (server actions, Zod), Vitest + `@electric-sql/pglite` (test RPC trên Postgres in-process).

**Spec:** `docs/superpowers/specs/2026-06-06-gia-von-lien-hoan-va-bang-nxt-design.md` (§4 là Giai đoạn 1; §4.2.bis là bất biến KHÔNG chênh lệch).

---

## File Structure

**Tạo mới:**
- `features/inventory-cost/moving-cost.ts` — hàm thuần `applyReceipt` / `applyIssue` (công thức liên hoàn, để test + tái dùng ở G2).
- `features/inventory-cost/moving-cost.test.ts` — test đơn vị hàm thuần.
- `supabase/migrations/0029_warehouse_opening_enum.sql` — thêm enum value `opening` (tách riêng để commit trước khi dùng).
- `supabase/migrations/0030_moving_average_cost.sql` — bảng cache + 2 helper + 7 RPC (receive/issue/deduct/transfer/adjust/set_opening/close).
- `supabase/tests/moving_average_cost.test.ts` — test RPC trên PGlite (9 ca, gồm bất biến).

**Sửa:**
- `features/inventory-cost/schema.ts` — `openingStockSchema` thêm `warehouse_id`.
- `features/inventory-cost/actions.ts` — `setOpeningStock` truyền `p_warehouse_id`.
- `features/inventory-cost/queries.ts` — thêm `listOpeningBalances(period)`.
- `app/(app)/kho/so-du-dau-ky/page.tsx` — nạp danh sách kho + opening theo kỳ.
- `app/(app)/kho/so-du-dau-ky/OpeningBalanceClient.tsx` — thêm chọn Kho + bảng hiển thị theo kho.

---

## Task 1: Hàm thuần công thức liên hoàn (TDD)

**Files:**
- Create: `features/inventory-cost/moving-cost.ts`
- Test: `features/inventory-cost/moving-cost.test.ts`

- [ ] **Step 1: Viết test thất bại**

Tạo `features/inventory-cost/moving-cost.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { applyReceipt, applyIssue, type MovingState } from './moving-cost'

describe('applyReceipt — bình quân liên hoàn khi nhập', () => {
  it('lần đầu (tồn 0): avg = giá lô', () => {
    const r = applyReceipt({ qty: 0, avg: 0 }, 10, 100)
    expect(r.state).toEqual({ qty: 10, avg: 100 })
    expect(r.lineUnitCost).toBe(100)
  })
  it('nhập lô thứ hai: bình quân lại (10@100 + 10@120 → 110)', () => {
    const r = applyReceipt({ qty: 10, avg: 100 }, 10, 120)
    expect(r.state).toEqual({ qty: 20, avg: 110 })
    expect(r.lineUnitCost).toBe(120)
  })
  it('nhập lô thứ ba sau khi xuất (15@110 + 5@140 → 117.5)', () => {
    const r = applyReceipt({ qty: 15, avg: 110 }, 5, 140)
    expect(r.state).toEqual({ qty: 20, avg: 117.5 })
  })
  it('không nhập đơn giá → dùng avg hiện hành (BQ không đổi)', () => {
    const r = applyReceipt({ qty: 10, avg: 100 }, 10, null)
    expect(r.state).toEqual({ qty: 20, avg: 100 })
    expect(r.lineUnitCost).toBe(100)
  })
  it('tồn ≤ 0 (kho âm) → lấy giá lô mới làm avg', () => {
    const r = applyReceipt({ qty: -5, avg: 100 }, 10, 200)
    expect(r.state).toEqual({ qty: 5, avg: 200 })
  })
})

describe('applyIssue — xuất theo avg hiện hành', () => {
  it('xuất lấy avg hiện hành, avg KHÔNG đổi', () => {
    const r = applyIssue({ qty: 20, avg: 110 }, 5)
    expect(r.state).toEqual({ qty: 15, avg: 110 })
    expect(r.lineUnitCost).toBe(110)
  })
  it('xuất quá tồn → qty âm, avg giữ nguyên', () => {
    const r = applyIssue({ qty: 10, avg: 100 }, 15)
    expect(r.state).toEqual({ qty: -5, avg: 100 })
    expect(r.lineUnitCost).toBe(100)
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd "D:\Finance System\kbit" && npx vitest run features/inventory-cost/moving-cost.test.ts`
Expected: FAIL — `Failed to resolve import "./moving-cost"`.

- [ ] **Step 3: Viết hàm thuần tối thiểu**

Tạo `features/inventory-cost/moving-cost.ts`:

```typescript
/**
 * Giá vốn bình quân LIÊN HOÀN (moving average) — hàm THUẦN (không chạm DB).
 * Đơn giá BQ tính theo MÃ (gộp mọi kho). Phải KHỚP với logic plpgsql trong
 * migration 0030 (kbit_mc_receive / kbit_mc_issue).
 *   Nhập:  avg' = (qty*avg + q*u) / (qty+q)   nếu qty > 0; ngược lại avg' = u
 *   Xuất:  avg KHÔNG đổi; giá vốn xuất = avg hiện hành
 * Quy ước làm tròn: chỉ round 2 chữ số cho ĐƠN GIÁ (avg, unit_cost); KHÔNG round số lượng.
 */
export interface MovingState { qty: number; avg: number }

const round2 = (x: number) => Math.round(x * 100) / 100

export function applyReceipt(
  s: MovingState, qty: number, unitCost: number | null,
): { state: MovingState; lineUnitCost: number } {
  const u = unitCost ?? s.avg
  const newQty = s.qty + qty
  const newAvg = s.qty > 0 ? round2((s.qty * s.avg + qty * u) / (s.qty + qty)) : round2(u)
  return { state: { qty: newQty, avg: newAvg }, lineUnitCost: round2(u) }
}

export function applyIssue(
  s: MovingState, qty: number,
): { state: MovingState; lineUnitCost: number } {
  return { state: { qty: s.qty - qty, avg: s.avg }, lineUnitCost: round2(s.avg) }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run features/inventory-cost/moving-cost.test.ts`
Expected: PASS — 7 passed.

- [ ] **Step 5: Commit**

```bash
git add features/inventory-cost/moving-cost.ts features/inventory-cost/moving-cost.test.ts
git commit -m "feat(gia-von): ham thuan binh quan lien hoan (G1 task1)"
```

---

## Task 2: Migration — enum `opening`, bảng cache, helper + RPC liên hoàn

**Files:**
- Create: `supabase/migrations/0029_warehouse_opening_enum.sql`
- Create: `supabase/migrations/0030_moving_average_cost.sql`

> **Lý do tách 0029/0030:** `ALTER TYPE ... ADD VALUE` không cho dùng value mới trong cùng transaction. Để 0029 commit trước, 0030 mới được dùng `'opening'`.

- [ ] **Step 1: Tạo migration enum `opening`**

Tạo `supabase/migrations/0029_warehouse_opening_enum.sql`:

```sql
-- KBIT 0029 — Thêm loại giao dịch 'opening' (số dư đầu kỳ) vào sổ kho.
-- Tách riêng khỏi 0030: value enum mới không dùng được trong cùng transaction vừa thêm.
alter type warehouse_txn_type add value if not exists 'opening';
```

- [ ] **Step 2: Tạo migration 0030 — phần cache + helper**

Tạo `supabase/migrations/0030_moving_average_cost.sql` với nội dung (PHẦN A):

```sql
-- ============ KBIT 0030 — GIÁ VỐN BÌNH QUÂN LIÊN HOÀN (moving average) ============
-- Đổi toàn hệ thống từ BQ cuối kỳ (0028) sang LIÊN HOÀN. Chưa có data thật → thay thẳng.
-- Đơn giá BQ theo MÃ (gộp mọi kho); số lượng quản lý theo KHO.
-- Sổ cái warehouse_transactions = nguồn sự thật (gồm 'opening'); product_moving_cost = cache giá BQ hiện hành.
-- Spec: docs/superpowers/specs/2026-06-06-gia-von-lien-hoan-va-bang-nxt-design.md

-- ── 1) Cache giá vốn BQ liên hoàn hiện hành (theo MÃ, gộp mọi kho) ──────────────
create table if not exists product_moving_cost (
  product_id  uuid primary key references products(id),
  qty_on_hand numeric(18,3) not null default 0,
  avg_cost    numeric(18,2) not null default 0,
  updated_at  timestamptz not null default now()
);
alter table product_moving_cost enable row level security;
create policy pmc_sel on product_moving_cost for select to authenticated using (true);
create policy pmc_ins on product_moving_cost for insert to authenticated with check (kbit_can_edit());
create policy pmc_upd on product_moving_cost for update to authenticated using (kbit_can_edit());

-- ── 2) Helper NHẬP: cập nhật BQ liên hoàn; trả về đơn giá ghi sổ. ───────────────
--    unit_cost NULL → dùng avg hiện hành. Tồn ≤ 0 → lấy giá lô mới.
create or replace function kbit_mc_receive(p_product_id uuid, p_qty numeric, p_unit_cost numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0; v_u numeric; v_newqty numeric; v_newavg numeric;
begin
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost where product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  v_u := coalesce(p_unit_cost, v_avg);
  v_newqty := v_qty + p_qty;
  v_newavg := case when v_qty > 0 then round((v_qty*v_avg + p_qty*v_u)/(v_qty+p_qty), 2) else round(v_u, 2) end;
  insert into product_moving_cost(product_id, qty_on_hand, avg_cost, updated_at)
    values (p_product_id, v_newqty, v_newavg, now())
  on conflict (product_id) do update set qty_on_hand = v_newqty, avg_cost = v_newavg, updated_at = now();
  return round(v_u, 2);
end $$;

-- ── 3) Helper XUẤT: trả về giá vốn (avg hiện hành). avg KHÔNG đổi. ──────────────
create or replace function kbit_mc_issue(p_product_id uuid, p_qty numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0;
begin
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost where product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  insert into product_moving_cost(product_id, qty_on_hand, avg_cost, updated_at)
    values (p_product_id, v_qty - p_qty, v_avg, now())
  on conflict (product_id) do update set qty_on_hand = v_qty - p_qty, updated_at = now();
  return round(v_avg, 2);
end $$;
```

- [ ] **Step 3: Migration 0030 — RPC nhập/xuất/đơn bán (PHẦN B, nối tiếp file)**

Thêm tiếp vào `0030_moving_average_cost.sql`:

```sql
-- ── 4) NHẬP KHO ────────────────────────────────────────────────────────────────
drop function if exists kbit_receive_stock(uuid, uuid, numeric, date, text, uuid, numeric);
create or replace function kbit_receive_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_txn_date date,
  p_note text default null, p_created_by uuid default null, p_unit_cost numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_line numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền nhập kho'; end if;
  v_line := kbit_mc_receive(p_product_id, p_qty, p_unit_cost);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, p_qty)
  on conflict (warehouse_id, product_id) do update set
    qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at = now();
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost)
  values ('receipt', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by, v_line);
end $$;

-- ── 5) XUẤT KHO ────────────────────────────────────────────────────────────────
create or replace function kbit_issue_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_reason issue_reason,
  p_txn_date date, p_note text default null, p_created_by uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền xuất kho'; end if;
  v_cost := kbit_mc_issue(p_product_id, p_qty);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, reason, txn_date, note, created_by, unit_cost)
  values ('issue', p_warehouse_id, p_product_id, p_qty, p_reason, p_txn_date, p_note, p_created_by, v_cost);
end $$;

-- ── 6) XUẤT THEO ĐƠN BÁN: giá vốn realtime + gán cost_price ngay ────────────────
drop function if exists kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid, date);
create or replace function kbit_deduct_order_item(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric, p_order_id uuid,
  p_created_by uuid default null, p_txn_date date default current_date
) returns void language plpgsql security definer set search_path = public as $$
declare v_cost numeric;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền trừ kho'; end if;
  v_cost := kbit_mc_issue(p_product_id, p_qty);
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0)
  on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, ref_order_id, created_by, unit_cost)
  values ('order_deduction', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_order_id, p_created_by, v_cost);
  if p_order_id is not null then
    update customer_order_items set cost_price = v_cost
      where order_id = p_order_id and product_id = p_product_id and cost_price is null;
  end if;
end $$;
grant execute on function kbit_deduct_order_item(uuid, uuid, numeric, uuid, uuid, date) to authenticated;
```

- [ ] **Step 4: Migration 0030 — luân chuyển + điều chỉnh (PHẦN C, nối tiếp file)**

Thêm tiếp:

```sql
-- ── 7) LUÂN CHUYỂN: tổng tồn mã không đổi → cache giữ nguyên; ghi 2 dòng unit_cost = avg ──
create or replace function kbit_transfer_stock_full(
  p_from_warehouse uuid, p_to_warehouse uuid, p_product_id uuid, p_qty numeric,
  p_txn_date date, p_note text default null, p_created_by uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_transfer_id uuid := gen_random_uuid(); v_avg numeric := 0;
begin
  if not kbit_can_edit() then raise exception 'Không có quyền luân chuyển kho'; end if;
  select coalesce(avg_cost, 0) into v_avg from product_moving_cost where product_id = p_product_id;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_from_warehouse, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand - p_qty, updated_at = now()
    where warehouse_id = p_from_warehouse and product_id = p_product_id;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_to_warehouse, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand + p_qty, updated_at = now()
    where warehouse_id = p_to_warehouse and product_id = p_product_id;
  insert into warehouse_transactions
    (txn_type, warehouse_id, to_warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by, unit_cost)
  values ('transfer_out', p_from_warehouse, p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by, v_avg);
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, ref_transfer_id, created_by, unit_cost)
  values ('transfer_in', p_to_warehouse, p_product_id, p_qty, p_txn_date, p_note, v_transfer_id, p_created_by, v_avg);
  return v_transfer_id;
end $$;

-- ── 8) ĐIỀU CHỈNH: đổi tồn 1 kho + đồng bộ cache qty (avg giữ). Chưa vào sổ NXT (mở ngỏ G2). ──
create or replace function kbit_adjust_stock(p_warehouse_id uuid, p_product_id uuid, p_delta numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not kbit_can_edit() then raise exception 'Không có quyền chỉnh tồn kho'; end if;
  insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
    values (p_warehouse_id, p_product_id, 0) on conflict (warehouse_id, product_id) do nothing;
  update warehouse_stock set qty_on_hand = qty_on_hand + p_delta, updated_at = now()
    where warehouse_id = p_warehouse_id and product_id = p_product_id;
  insert into product_moving_cost (product_id, qty_on_hand, avg_cost, updated_at)
    values (p_product_id, p_delta, 0, now())
  on conflict (product_id) do update set
    qty_on_hand = product_moving_cost.qty_on_hand + p_delta, updated_at = now();
end $$;
```

- [ ] **Step 5: Migration 0030 — số dư đầu kỳ theo kho + chốt kỳ = khóa sổ (PHẦN D, nối tiếp file)**

Thêm tiếp (kết thúc file):

```sql
-- ── 9) SỐ DƯ ĐẦU KỲ theo KHO: ghi/ghi đè 1 dòng 'opening' + đặt tồn kho + cập nhật cache ──
drop function if exists kbit_set_opening_stock(uuid, text, numeric, numeric);
create or replace function kbit_set_opening_stock(
  p_product_id uuid, p_warehouse_id uuid, p_period text, p_qty numeric, p_unit_cost numeric
) returns void language plpgsql security definer set search_path = public as $$
declare v_date date; v_old_qty numeric := 0; v_line numeric;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_date := to_date(p_period||'-01','YYYY-MM-DD');
  select coalesce(sum(qty),0) into v_old_qty from warehouse_transactions
    where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
  if v_old_qty <> 0 then
    delete from warehouse_transactions
      where product_id=p_product_id and warehouse_id=p_warehouse_id and txn_type='opening' and txn_date=v_date;
    update warehouse_stock set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where warehouse_id=p_warehouse_id and product_id=p_product_id;
    update product_moving_cost set qty_on_hand = qty_on_hand - v_old_qty, updated_at=now()
      where product_id=p_product_id;
  end if;
  if p_qty > 0 then
    v_line := kbit_mc_receive(p_product_id, p_qty, p_unit_cost);
    insert into warehouse_stock (warehouse_id, product_id, qty_on_hand)
      values (p_warehouse_id, p_product_id, p_qty)
    on conflict (warehouse_id, product_id) do update set
      qty_on_hand = warehouse_stock.qty_on_hand + p_qty, updated_at=now();
    insert into warehouse_transactions (txn_type, warehouse_id, product_id, qty, txn_date, note, unit_cost)
      values ('opening', p_warehouse_id, p_product_id, p_qty, v_date, 'Số dư đầu kỳ', v_line);
  end if;
end $$;
grant execute on function kbit_set_opening_stock(uuid, uuid, text, numeric, numeric) to authenticated;

-- ── 10) CHỐT KỲ = KHÓA SỔ: snapshot cộng dồn từ sổ (KHÔNG tính lại giá). ──────────
--    Bảo toàn: value_open + value_in = value_out + value_close (§4.2.bis).
create or replace function kbit_close_inventory_cost(p_period text)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_start date; v_end date;
        v_qo numeric; v_vo numeric; v_qi numeric; v_vi numeric; v_qou numeric; v_vou numeric;
        v_qc numeric; v_vc numeric; v_avg numeric;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_start := to_date(p_period||'-01','YYYY-MM-DD');
  v_end   := (v_start + interval '1 month')::date;
  for r in select distinct product_id from warehouse_transactions
           where product_id is not null and txn_date < v_end loop
    select
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty else 0 end),0),
      coalesce(sum(case when txn_type in ('receipt','transfer_in','opening') then qty*coalesce(unit_cost,0)
                        when txn_type in ('issue','order_deduction','transfer_out') then -qty*coalesce(unit_cost,0) else 0 end),0)
      into v_qo, v_vo from warehouse_transactions
      where product_id=r.product_id and txn_date < v_start;
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0) into v_qi, v_vi
      from warehouse_transactions
      where product_id=r.product_id and txn_date>=v_start and txn_date<v_end and txn_type='receipt';
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0) into v_qou, v_vou
      from warehouse_transactions
      where product_id=r.product_id and txn_date>=v_start and txn_date<v_end and txn_type in ('issue','order_deduction');
    v_qc := v_qo + v_qi - v_qou;
    v_vc := round(v_vo + v_vi - v_vou, 2);
    v_avg := case when v_qc > 0 then round(v_vc / v_qc, 2) else 0 end;
    insert into inventory_cost_periods
      (product_id, period, qty_open, value_open, qty_in, value_in, qty_out, value_out, avg_unit_cost, qty_close, value_close, status, closed_at)
    values
      (r.product_id, p_period, v_qo, round(v_vo,2), v_qi, round(v_vi,2), v_qou, round(v_vou,2), v_avg, v_qc, v_vc, 'closed', now())
    on conflict (product_id, period) do update set
      qty_open=excluded.qty_open, value_open=excluded.value_open, qty_in=excluded.qty_in, value_in=excluded.value_in,
      qty_out=excluded.qty_out, value_out=excluded.value_out, avg_unit_cost=excluded.avg_unit_cost,
      qty_close=excluded.qty_close, value_close=excluded.value_close, status='closed', closed_at=now();
  end loop;
end $$;
grant execute on function kbit_close_inventory_cost(text) to authenticated;
```

- [ ] **Step 6: Kiểm migration áp được trên PGlite (sanity)**

Run: `cd "D:\Finance System\kbit" && node -e "import('@electric-sql/pglite').then(async ({PGlite})=>{const fs=require('fs'),p=require('path');const db=new PGlite();await db.exec(\"create role anon;create role authenticated;create role service_role;create schema if not exists auth;create or replace function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;\");const d='supabase/migrations';for(const f of fs.readdirSync(d).filter(x=>x.endsWith('.sql')).sort()){await db.exec(fs.readFileSync(p.join(d,f),'utf8').replace(/create extension if not exists\s+\"?pgcrypto\"?\s*;/gi,'-- skip'))}console.log('MIGRATIONS OK');await db.query('select 1 from product_moving_cost limit 1');console.log('product_moving_cost EXISTS')}).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"`
Expected: in ra `MIGRATIONS OK` rồi `product_moving_cost EXISTS`. Nếu lỗi enum `opening` (unsafe use of new value) → xác nhận 0029 đứng RIÊNG file trước 0030.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0029_warehouse_opening_enum.sql supabase/migrations/0030_moving_average_cost.sql
git commit -m "feat(gia-von): migration 0029+0030 binh quan lien hoan (G1 task2)"
```

---

## Task 3: Test RPC trên PGlite (9 ca, gồm bất biến không chênh)

**Files:**
- Create: `supabase/tests/moving_average_cost.test.ts`

- [ ] **Step 1: Viết test đầy đủ**

Tạo `supabase/tests/moving_average_cost.test.ts`:

```typescript
// Test giá vốn BÌNH QUÂN LIÊN HOÀN (moving average) trên Postgres thật (PGlite).
// Dựng DB từ TOÀN BỘ migrations (gồm 0029+0030), gọi RPC, kiểm cache + sổ + cost_price + bất biến.
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')

let db: PGlite
let whVN: string, whKR: string, userId: string, companyId: string, custId: string

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params)
  return Object.values(r.rows[0])[0]
}
let prodSeq = 0
async function freshProduct(): Promise<string> {
  prodSeq += 1
  return val<string>(`insert into products(code,name,unit) values ($1,$2,'cái') returning id`, [`MAC-${prodSeq}`, `SP ${prodSeq}`])
}
async function mc(p: string): Promise<{ qty: number; avg: number }> {
  const r = await db.query<{ qty_on_hand: string; avg_cost: string }>(
    `select qty_on_hand, avg_cost from product_moving_cost where product_id=$1`, [p])
  if (r.rows.length === 0) return { qty: 0, avg: 0 }
  return { qty: Number(r.rows[0].qty_on_hand), avg: Number(r.rows[0].avg_cost) }
}
async function stockQty(wh: string, p: string): Promise<number> {
  const r = await db.query<{ q: string }>(
    `select coalesce((select qty_on_hand from warehouse_stock where warehouse_id=$1 and product_id=$2),0)::text q`, [wh, p])
  return Number(r.rows[0].q)
}
async function lastUnitCost(p: string, type: string): Promise<number> {
  const r = await db.query<{ unit_cost: string }>(
    `select unit_cost::text unit_cost from warehouse_transactions
     where product_id=$1 and txn_type=$2 order by created_at desc, id desc limit 1`, [p, type])
  return Number(r.rows[0].unit_cost)
}
const D = '2026-06-10'
const receive = (wh: string, p: string, n: number, cost: number | null, d = D) =>
  db.query(`select kbit_receive_stock($1,$2,$3,$4::date,'nhap',$5,$6)`, [wh, p, n, d, userId, cost])
const issue = (wh: string, p: string, n: number, d = D) =>
  db.query(`select kbit_issue_stock($1,$2,$3,'sale'::issue_reason,$4::date,'xuat',$5)`, [wh, p, n, d, userId])
const transfer = (from: string, to: string, p: string, n: number, d = D) =>
  db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,$5::date,'chuyen',$6)`, [from, to, p, n, d, userId])
const opening = (p: string, wh: string, period: string, n: number, cost: number) =>
  db.query(`select kbit_set_opening_stock($1,$2,$3,$4,$5)`, [p, wh, period, n, cost])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create or replace function auth.uid()  returns uuid  language sql stable as $$ select '${FIXED_UID}'::uuid $$;
    create or replace function auth.role() returns text  language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt()  returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `)
  for (const f of readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))
  }
  userId = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'KTT','ktt@test.local','chief_accountant') returning id`, [FIXED_UID])
  companyId = await val<string>(`insert into companies(code,name,country,base_currency) values ('TSTCO','Test Co','VN','VND') returning id`)
  custId = await val<string>(`insert into customers(code,name) values ('KH01','KH Test') returning id`)
  whVN = await val<string>(`select id from warehouses where code='KHO-VN'`)
  whKR = await val<string>(`select id from warehouses where code='KHO-KR'`)
}, 180_000)

describe('Giá vốn bình quân LIÊN HOÀN', () => {
  it('nhập 10@100 rồi 10@120 → avg 110, qty 20', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100); expect(await mc(p)).toEqual({ qty: 10, avg: 100 })
    await receive(whVN, p, 10, 120); expect(await mc(p)).toEqual({ qty: 20, avg: 110 })
  })
  it('xuất lấy avg hiện hành; avg không đổi; dòng sổ ghi đúng giá vốn', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100); await receive(whVN, p, 10, 120)
    await issue(whVN, p, 5)
    expect(await lastUnitCost(p, 'issue')).toBe(110)
    expect(await mc(p)).toEqual({ qty: 15, avg: 110 })
  })
  it('nhập tiếp lô khác → tính lại BQ liên hoàn (→ 117.5)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100); await receive(whVN, p, 10, 120); await issue(whVN, p, 5)
    await receive(whVN, p, 5, 140)
    expect(await mc(p)).toEqual({ qty: 20, avg: 117.5 })
  })
  it('nhập KHÔNG đơn giá → dùng avg hiện hành (BQ không đổi)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100); await receive(whVN, p, 10, null)
    expect(await mc(p)).toEqual({ qty: 20, avg: 100 })
    expect(await lastUnitCost(p, 'receipt')).toBe(100)
  })
  it('kho âm: xuất quá tồn → qty âm; nhập lại lấy giá lô mới', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100); await issue(whVN, p, 15)
    expect(await mc(p)).toEqual({ qty: -5, avg: 100 })
    await receive(whVN, p, 10, 200)
    expect(await mc(p)).toEqual({ qty: 5, avg: 200 })
  })
  it('luân chuyển: avg & tổng tồn không đổi; 2 kho đổi số lượng; 2 dòng unit_cost=avg', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 50); await transfer(whVN, whKR, p, 30)
    expect(await mc(p)).toEqual({ qty: 100, avg: 50 })
    expect(await stockQty(whVN, p)).toBe(70)
    expect(await stockQty(whKR, p)).toBe(30)
    expect(await lastUnitCost(p, 'transfer_out')).toBe(50)
    expect(await lastUnitCost(p, 'transfer_in')).toBe(50)
  })
  it('số dư đầu kỳ THEO KHO: 2 kho cùng mã cùng giá → avg=giá, tổng=cộng; tồn từng kho đúng', async () => {
    const p = await freshProduct()
    await opening(p, whVN, '2026-06', 100, 80); await opening(p, whKR, '2026-06', 50, 80)
    expect(await mc(p)).toEqual({ qty: 150, avg: 80 })
    expect(await stockQty(whVN, p)).toBe(100)
    expect(await stockQty(whKR, p)).toBe(50)
  })
  it('LÃI GỘP realtime: cost_price dòng bán = avg lúc trừ kho', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100); await receive(whVN, p, 10, 120) // avg 110
    const orderId = await val<string>(
      `insert into customer_orders(company_id,customer_id,order_code,order_date) values ($1,$2,$3,$4::date) returning id`,
      [companyId, custId, `SO-${prodSeq}`, D])
    await db.query(`insert into customer_order_items(order_id,product_id,qty,unit_price) values ($1,$2,5,200)`, [orderId, p])
    await db.query(`select kbit_deduct_order_item($1,$2,$3,$4,$5,$6::date)`, [whVN, p, 5, orderId, userId, D])
    const cp = await val<string>(`select cost_price::text from customer_order_items where order_id=$1 and product_id=$2`, [orderId, p])
    expect(Number(cp)).toBe(110)
    expect(await lastUnitCost(p, 'order_deduction')).toBe(110)
  })
  it('BẤT BIẾN không chênh (§4.2.bis): khóa sổ = cộng dồn liên hoàn; Đầu+Nhập=Xuất+Cuối', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100, '2026-07-02')   // avg 100
    await issue(whVN, p, 4, '2026-07-05')           // 4@100 = 400
    await receive(whVN, p, 10, 200, '2026-07-10')   // (6*100+10*200)/16 = 162.5
    await issue(whVN, p, 5, '2026-07-20')           // 5@162.5 = 812.5
    await db.query(`select kbit_close_inventory_cost('2026-07')`)
    const row = await db.query<Record<string, string>>(
      `select qty_open,value_open,qty_in,value_in,qty_out,value_out,qty_close,value_close
       from inventory_cost_periods where product_id=$1 and period='2026-07'`, [p])
    const r = row.rows[0]
    const vOpen = Number(r.value_open), vIn = Number(r.value_in), vOut = Number(r.value_out), vClose = Number(r.value_close)
    expect(vOpen + vIn).toBeCloseTo(vOut + vClose, 2)  // bảo toàn tuyệt đối
    expect(vIn).toBe(3000)                              // 10*100 + 10*200
    expect(vOut).toBe(1212.5)                           // 400 + 812.5 (liên hoàn)
    expect(Number(r.qty_close)).toBe(11)                // 10 - 4 + 10 - 5
    expect(vClose).toBe(1787.5)                         // 3000 - 1212.5
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận PASS**

Run: `cd "D:\Finance System\kbit" && npx vitest run supabase/tests/moving_average_cost.test.ts`
Expected: PASS — 9 passed. Nếu đỏ: đọc lỗi, sửa migration 0030 (Task 2) cho khớp, chạy lại.

- [ ] **Step 3: Chạy lại test kho cũ để chắc không vỡ (regression)**

Run: `npx vitest run supabase/tests/warehouse_stock_negative_check.test.ts`
Expected: PASS — các test cho phép tồn âm vẫn xanh (receive/issue/adjust/deduct/transfer vẫn đúng số lượng).

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/moving_average_cost.test.ts
git commit -m "test(gia-von): test RPC binh quan lien hoan + bat bien khong chenh (G1 task3)"
```

---

## Task 4: Số dư đầu kỳ THEO KHO (schema, action, query, UI)

**Files:**
- Modify: `features/inventory-cost/schema.ts`
- Modify: `features/inventory-cost/actions.ts:8-20`
- Modify: `features/inventory-cost/queries.ts` (thêm hàm)
- Modify: `app/(app)/kho/so-du-dau-ky/page.tsx`
- Modify: `app/(app)/kho/so-du-dau-ky/OpeningBalanceClient.tsx`

- [ ] **Step 1: Thêm `warehouse_id` vào `openingStockSchema`**

Trong `features/inventory-cost/schema.ts`, thay khối `openingStockSchema` thành:

```typescript
export const openingStockSchema = z.object({
  product_id:   z.string().uuid('Chọn mã hàng'),
  warehouse_id: z.string().uuid('Chọn kho'),
  period:       z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM'),
  qty:          z.coerce.number().nonnegative('SL ≥ 0'),
  unit_cost:    z.coerce.number().nonnegative('Đơn giá vốn ≥ 0'),
})
```

- [ ] **Step 2: Cập nhật `setOpeningStock` truyền `p_warehouse_id`**

Trong `features/inventory-cost/actions.ts`, thay phần gọi RPC trong `setOpeningStock`:

```typescript
  const { error } = await supabase.rpc('kbit_set_opening_stock', {
    p_product_id:   data.product_id,
    p_warehouse_id: data.warehouse_id,
    p_period:       data.period,
    p_qty:          data.qty,
    p_unit_cost:    data.unit_cost,
  })
```

- [ ] **Step 3: Thêm query `listOpeningBalances` (đọc từ sổ 'opening')**

Thêm vào cuối `features/inventory-cost/queries.ts`:

```typescript
/** Danh sách số dư đầu kỳ đã khai (txn_type='opening') trong 1 kỳ, kèm mã + kho. */
export async function listOpeningBalances(period: string) {
  const supabase = await createClient()
  const start = `${period}-01`
  const { data } = await supabase
    .from('warehouse_transactions')
    .select('product_id, warehouse_id, qty, unit_cost, products(code,name), warehouses(code,name)')
    .eq('txn_type', 'opening')
    .eq('txn_date', start)
    .order('product_id')
  return (data ?? []).map((r: any) => ({
    product_id:   r.product_id,
    warehouse_id: r.warehouse_id,
    qty:          Number(r.qty),
    unit_cost:    r.unit_cost != null ? Number(r.unit_cost) : 0,
    value:        Number(r.qty) * (r.unit_cost != null ? Number(r.unit_cost) : 0),
    product:      r.products ? `[${r.products.code}] ${r.products.name}` : r.product_id,
    warehouse:    r.warehouses ? r.warehouses.name : r.warehouse_id,
  }))
}
```

- [ ] **Step 4: Cập nhật `page.tsx` nạp kho + opening**

Thay toàn bộ `app/(app)/kho/so-du-dau-ky/page.tsx`:

```typescript
import { getCurrentUser, canEdit } from '@/lib/auth'
import { listProducts } from '@/features/products/queries'
import { listWarehouses } from '@/features/warehouse/queries'
import { listOpeningBalances } from '@/features/inventory-cost/queries'
import { todayLocal } from '@/lib/format'
import { OpeningBalanceClient } from './OpeningBalanceClient'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams
  const period = sp.period || todayLocal().slice(0, 7)
  const [me, products, warehouses, openings] = await Promise.all([
    getCurrentUser(),
    listProducts(),
    listWarehouses(),
    listOpeningBalances(period),
  ])
  return (
    <OpeningBalanceClient
      period={period}
      canWrite={!!me && canEdit(me.role)}
      products={products.map((p: any) => ({ id: p.id, code: p.code as string, name: p.name }))}
      warehouses={warehouses.map((w: any) => ({ id: w.id, code: w.code as string, name: w.name }))}
      openings={openings}
    />
  )
}
```

- [ ] **Step 5: Cập nhật `OpeningBalanceClient.tsx` thêm chọn Kho + bảng theo kho**

Thay toàn bộ `app/(app)/kho/so-du-dau-ky/OpeningBalanceClient.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setOpeningStock } from '@/features/inventory-cost/actions'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { formatVND } from '@/lib/format'

interface Product { id: string; code: string; name: string }
interface Warehouse { id: string; code: string; name: string }
interface Opening { product_id: string; warehouse_id: string; qty: number; unit_cost: number; value: number; product: string; warehouse: string }

export function OpeningBalanceClient({ period, canWrite, products, warehouses, openings }: {
  period: string; canWrite: boolean; products: Product[]; warehouses: Warehouse[]; openings: Opening[]
}) {
  const router = useRouter()
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [qty, setQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    const r = await setOpeningStock({ product_id: productId, warehouse_id: warehouseId, period, qty, unit_cost: unitCost })
    setSaving(false)
    if (r.error) { setError(r.error); return }
    setProductId(''); setWarehouseId(''); setQty(''); setUnitCost(''); router.refresh()
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader title="Số dư đầu kỳ kho" subtitle="Khai SL tồn + đơn giá vốn đầu kỳ cho từng mã TẠI TỪNG KHO (làm 1 lần khi bắt đầu áp dụng giá vốn)" />

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500">Kỳ mốc</label>
        <input type="month" value={period} onChange={e => router.push(`/kho/so-du-dau-ky?period=${e.target.value}`)}
          className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
      </div>

      {canWrite && (
        <div className="rounded-xl border bg-white p-4 grid grid-cols-5 gap-3 items-end">
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-gray-500">Mã hàng</label>
            <select value={productId} onChange={e => setProductId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
              <option value="">— Chọn mã —</option>
              {products.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Kho</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
              <option value="">— Chọn kho —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">SL tồn đầu</label>
            <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Đơn giá vốn</label>
            <input type="number" min="0" step="any" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" />
          </div>
          <div className="col-span-5 flex items-center gap-3">
            <button onClick={save} disabled={saving || !productId || !warehouseId} className="h-9 px-4 bg-brand-800 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Lưu số dư đầu kỳ'}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Mã hàng</th>
              <th className="px-4 py-3 text-left">Kho</th>
              <th className="px-4 py-3 text-right">SL tồn đầu</th>
              <th className="px-4 py-3 text-right">Đơn giá vốn</th>
              <th className="px-4 py-3 text-right">Giá trị đầu</th>
            </tr>
          </thead>
          <tbody>
            {openings.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Chưa khai số dư đầu kỳ nào cho kỳ {period}</td></tr>
            ) : openings.map((o, i) => (
              <tr key={`${o.product_id}-${o.warehouse_id}-${i}`} className="border-t">
                <td className="px-4 py-3">{o.product}</td>
                <td className="px-4 py-3">{o.warehouse}</td>
                <td className="px-4 py-3 text-right">{o.qty.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right">{formatVND(o.unit_cost)}</td>
                <td className="px-4 py-3 text-right">{formatVND(o.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Kiểm build TypeScript**

Run: `cd "D:\Finance System\kbit" && npx tsc --noEmit`
Expected: không lỗi liên quan các file vừa sửa (`inventory-cost`, `so-du-dau-ky`). (Nếu repo có lỗi tsc nền sẵn ở chỗ khác, chỉ cần KHÔNG phát sinh lỗi MỚI ở file mình động vào.)

- [ ] **Step 7: Commit**

```bash
git add features/inventory-cost/schema.ts features/inventory-cost/actions.ts features/inventory-cost/queries.ts "app/(app)/kho/so-du-dau-ky/page.tsx" "app/(app)/kho/so-du-dau-ky/OpeningBalanceClient.tsx"
git commit -m "feat(gia-von): so du dau ky theo kho (G1 task4)"
```

---

## Task 5: Verify tổng + review độc lập + memory

**Files:** không sửa code mới; chạy kiểm chứng.

- [ ] **Step 1: Chạy TOÀN BỘ test của repo**

Run: `cd "D:\Finance System\kbit" && npm run test`
Expected: tất cả XANH — gồm `moving-cost.test.ts` (7), `moving_average_cost.test.ts` (9), `avg-cost.test.ts` (cũ, vẫn xanh vì không xóa `computePeriodCost`), `warehouse_stock_negative_check.test.ts`, `dinh_khoan_chi_thu.test.ts`.

- [ ] **Step 2: Build production**

Run: `npm run build`
Expected: build thành công (exit 0). Nếu Next.js bản tùy biến báo lỗi API → đọc `node_modules/next/dist/docs/` đúng phần báo lỗi rồi sửa (theo `kbit/AGENTS.md`).

- [ ] **Step 3: Review độc lập (BẮT BUỘC — đụng số liệu kế toán)**

Bung skill `superpowers:requesting-code-review` cho diff Giai đoạn 1. Reviewer kiểm: công thức liên hoàn khớp giữa `moving-cost.ts` và 0030; bất biến §4.2.bis; biên tồn âm; opening theo kho; không vỡ luồng order. Vá hết BLOCKER trước khi báo Anh Thịnh.

- [ ] **Step 4: Cập nhật memory**

Cập nhật `kbit-gia-von-lien-hoan.md`: đánh dấu Giai đoạn 1 ĐÃ code + test xanh (ghi số ca pass) + trạng thái chờ Anh Thịnh nghiệm thu. Sửa dòng tương ứng trong `MEMORY.md`.

- [ ] **Step 5: Báo Anh Thịnh nghiệm thu**

Tóm tắt: đã đổi xong nền giá vốn liên hoàn; bằng chứng test (đặc biệt ca BẤT BIẾN không chênh); mời anh nghịch thử. CHỜ anh duyệt rồi mới sang Giai đoạn 2.

---

## Self-Review (đã rà khi viết)

- **Spec coverage:** §4.1 (enum+bảng+cache) → Task 2; §4.2/4.2.bis (công thức + bất biến) → Task 1+2+3 (ca 9); §4.3 (6 RPC) → Task 2; §4.4 (lãi gộp realtime) → Task 2 (deduct) + Task 3 (ca 8); §4.5 (8 ca test) → Task 1 (thuần) + Task 3 (RPC, gồm bất biến); §4.6 (review độc lập) → Task 5; số dư đầu kỳ theo kho (Q10) → Task 2 (RPC) + Task 4 (UI). Không có yêu cầu G1 nào thiếu task.
- **Type consistency:** `MovingState{qty,avg}`, `applyReceipt/applyIssue` dùng nhất quán Task 1↔3; tên RPC + thứ tự tham số khớp giữa migration (Task 2), test (Task 3), action (Task 4: `p_warehouse_id`).
- **No placeholder:** mọi step có code/lệnh cụ thể + expected.
- **Mở ngỏ có chủ ý (không phải thiếu sót):** `adjustment` chưa ghi sổ NXT (xử lý ở G2); sửa số dư đầu kỳ nhiều lần sau khi đã phát sinh có thể cần rebuild cache (ghi chú, G1 phục vụ khai lần đầu).
