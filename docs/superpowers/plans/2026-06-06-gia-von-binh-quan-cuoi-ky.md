# Giá vốn bình quân cuối kỳ + Lãi gộp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Theo dõi tồn kho theo giá trị + tính giá vốn xuất theo bình quân gia quyền cuối kỳ (tháng) → ra lãi gộp, chỉ thêm mới không phá luồng đang chạy.

**Architecture:** Một "thẻ giá vốn tháng" (`inventory_cost_periods`, gộp theo `product_id × period`) giữ tồn đầu/nhập/xuất/cuối + đơn giá BQ. Mỗi phát sinh kho ghi `unit_cost`; cuối tháng RPC `kbit_close_inventory_cost` tính BQ, gán giá vốn cho phiếu xuất + dòng đơn bán, gối đầu sang tháng sau. Logic tính BQ tách ra hàm THUẦN (test bằng vitest). UI: số dư đầu kỳ, nút chốt, báo cáo lãi gộp 3 mức.

**Tech Stack:** Next.js 16 (App Router, server actions) + Supabase (Postgres migrations + RPC) + zod + vitest (môi trường node).

**Spec:** `docs/superpowers/specs/2026-06-06-gia-von-binh-quan-cuoi-ky-design.md`

---

## File Structure

**Tạo mới:**
- `supabase/migrations/0028_inventory_cost.sql` — bảng `inventory_cost_periods`, 2 cột mới, RPC chốt + RPC số dư đầu kỳ, RLS/grant.
- `features/inventory-cost/avg-cost.ts` — hàm THUẦN tính BQ + giá trị (no DB).
- `features/inventory-cost/avg-cost.test.ts` — unit test thuần.
- `features/inventory-cost/schema.ts` — zod: opening balance, close.
- `features/inventory-cost/actions.ts` — server actions: nhập số dư đầu kỳ, chốt giá vốn.
- `features/inventory-cost/queries.ts` — đọc thẻ + lãi gộp 3 mức.
- `app/(app)/kho/gia-von/page.tsx` — trang "Giá vốn & chốt kỳ" (nút chốt + danh sách thẻ).
- `app/(app)/kho/so-du-dau-ky/page.tsx` + `OpeningBalanceClient.tsx` — nhập số dư đầu kỳ.
- `app/(app)/bao-cao/lai-gop/page.tsx` + `GrossProfitClient.tsx` — báo cáo lãi gộp 3 mức.

**Sửa (thêm, không đổi hành vi cũ):**
- `features/warehouse/schema.ts` — `receiptSchema` thêm `unit_cost`.
- `features/warehouse/actions.ts` — `receiveStock` truyền `p_unit_cost`.
- `features/warehouse/components/StockMutationForm.tsx` — form nhập kho thêm ô "Đơn giá vốn".
- `features/imports/actions.ts` — khi cộng kho, ghi `unit_cost` vào `warehouse_transactions`.
- `lib/nav.ts` — thêm 3 mục menu.

---

## Phase 0 — Migration nền

### Task 0: Bảng + 2 cột + grant

**Files:**
- Create: `supabase/migrations/0028_inventory_cost.sql`

- [ ] **Step 1: Viết migration (cấu trúc, chưa có RPC chốt)**

```sql
-- ============ KBIT — GIÁ VỐN BÌNH QUÂN CUỐI KỲ (THÁNG) ============
-- Chỉ THÊM mới. Gộp theo product_id (toàn bộ kho). period = 'YYYY-MM'.

-- 1) Cột giá vốn trên sổ kho + dòng đơn bán (nullable → an toàn dữ liệu cũ)
alter table warehouse_transactions add column if not exists unit_cost numeric(18,2);
alter table customer_order_items  add column if not exists cost_price numeric(18,2);

-- 2) Thẻ giá vốn tháng (1 dòng / mã / tháng)
create table if not exists inventory_cost_periods (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id),
  period        text not null,                      -- 'YYYY-MM'
  qty_open      numeric(18,3) not null default 0,
  value_open    numeric(18,2) not null default 0,
  qty_in        numeric(18,3) not null default 0,
  value_in      numeric(18,2) not null default 0,
  qty_out       numeric(18,3) not null default 0,
  value_out     numeric(18,2) not null default 0,
  avg_unit_cost numeric(18,2) not null default 0,
  qty_close     numeric(18,3) not null default 0,
  value_close   numeric(18,2) not null default 0,
  status        text not null default 'open',        -- 'open' | 'closed'
  closed_at     timestamptz,
  closed_by     uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (product_id, period)
);
create index if not exists idx_icp_period on inventory_cost_periods(period);

-- 3) RLS: đọc cho mọi user đăng nhập; ghi cho kbit_can_edit()
alter table inventory_cost_periods enable row level security;
create policy icp_sel on inventory_cost_periods for select to authenticated using (true);
create policy icp_ins on inventory_cost_periods for insert to authenticated with check (kbit_can_edit());
create policy icp_upd on inventory_cost_periods for update to authenticated using (kbit_can_edit());
```

- [ ] **Step 2: Kiểm migration nạp được (nếu có harness PGlite local hoặc supabase db)**

Run: `npm run build` (TypeScript không vỡ — migration chưa ảnh hưởng type)
Expected: build PASS. (Migration chạy thật khi admin deploy; ở local nếu có harness PGlite ở D:\tmp\kbit-local thì áp migration kiểm cú pháp SQL.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0028_inventory_cost.sql
git commit -m "feat(gia-von): bang inventory_cost_periods + cot unit_cost/cost_price"
```

---

## Phase 1 — Hàm THUẦN tính bình quân (TDD lõi)

### Task 1: `computePeriodCost` — tính đơn giá BQ + giá trị xuất/cuối

**Files:**
- Create: `features/inventory-cost/avg-cost.ts`
- Test: `features/inventory-cost/avg-cost.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, it, expect } from 'vitest'
import { computePeriodCost } from './avg-cost'

describe('computePeriodCost — bình quân gia quyền cuối kỳ', () => {
  it('ví dụ chuẩn: đầu 100@10, nhập 50@16, xuất 120', () => {
    const r = computePeriodCost({ qtyOpen: 100, valueOpen: 1000, qtyIn: 50, valueIn: 800, qtyOut: 120 })
    expect(r.avgUnitCost).toBe(12)       // (1000+800)/(100+50)
    expect(r.valueOut).toBe(1440)        // 120*12
    expect(r.qtyClose).toBe(30)
    expect(r.valueClose).toBe(360)       // 1000+800-1440
  })

  it('không có tồn đầu, chỉ nhập rồi xuất hết', () => {
    const r = computePeriodCost({ qtyOpen: 0, valueOpen: 0, qtyIn: 10, valueIn: 1000, qtyOut: 10 })
    expect(r.avgUnitCost).toBe(100)
    expect(r.valueOut).toBe(1000)
    expect(r.qtyClose).toBe(0)
    expect(r.valueClose).toBe(0)
  })

  it('không phát sinh nhập/xuất → BQ = giá trị đầu / SL đầu, tồn cuối = tồn đầu', () => {
    const r = computePeriodCost({ qtyOpen: 20, valueOpen: 240, qtyIn: 0, valueIn: 0, qtyOut: 0 })
    expect(r.avgUnitCost).toBe(12)
    expect(r.valueClose).toBe(240)
    expect(r.qtyClose).toBe(20)
  })

  it('tổng SL khả dụng = 0 → BQ = 0 (tránh chia 0)', () => {
    const r = computePeriodCost({ qtyOpen: 0, valueOpen: 0, qtyIn: 0, valueIn: 0, qtyOut: 0 })
    expect(r.avgUnitCost).toBe(0)
    expect(r.valueOut).toBe(0)
  })

  it('tồn âm: xuất nhiều hơn (đầu 10 + nhập 0, xuất 15) → tồn cuối âm, vẫn theo BQ', () => {
    const r = computePeriodCost({ qtyOpen: 10, valueOpen: 100, qtyIn: 0, valueIn: 0, qtyOut: 15 })
    expect(r.avgUnitCost).toBe(10)
    expect(r.valueOut).toBe(150)
    expect(r.qtyClose).toBe(-5)
    expect(r.valueClose).toBe(-50)
  })
})
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run features/inventory-cost/avg-cost.test.ts`
Expected: FAIL "computePeriodCost is not a function" (file chưa có).

- [ ] **Step 3: Viết hàm thuần tối thiểu**

```ts
/**
 * Tính giá vốn bình quân gia quyền CUỐI KỲ cho 1 mã / 1 tháng. Hàm THUẦN.
 *   avgUnitCost = (valueOpen + valueIn) / (qtyOpen + qtyIn)   [0 nếu mẫu số ≤ 0]
 *   valueOut    = qtyOut × avgUnitCost
 *   qtyClose    = qtyOpen + qtyIn − qtyOut
 *   valueClose  = valueOpen + valueIn − valueOut
 */
export interface PeriodCostInput {
  qtyOpen: number; valueOpen: number
  qtyIn: number;   valueIn: number
  qtyOut: number
}
export interface PeriodCostResult {
  avgUnitCost: number; valueOut: number
  qtyClose: number; valueClose: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function computePeriodCost(i: PeriodCostInput): PeriodCostResult {
  const avail = i.qtyOpen + i.qtyIn
  const avgUnitCost = avail > 0 ? round2((i.valueOpen + i.valueIn) / avail) : 0
  const valueOut = round2(i.qtyOut * avgUnitCost)
  const qtyClose = round2(i.qtyOpen + i.qtyIn - i.qtyOut)
  const valueClose = round2(i.valueOpen + i.valueIn - valueOut)
  return { avgUnitCost, valueOut, qtyClose, valueClose }
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run features/inventory-cost/avg-cost.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add features/inventory-cost/avg-cost.ts features/inventory-cost/avg-cost.test.ts
git commit -m "feat(gia-von): ham thuan computePeriodCost + test"
```

---

## Phase 2 — Ghi giá vốn khi NHẬP kho

> Mục tiêu: mọi phát sinh NHẬP (`receipt`) ghi `unit_cost` vào `warehouse_transactions`. Hai nguồn nhập: đơn mua (tự lấy `supplier_order_items.unit_cost`) và nhập thủ công (gõ tay).

### Task 2: RPC `kbit_receive_stock` nhận thêm `p_unit_cost`

**Files:**
- Modify: `supabase/migrations/0028_inventory_cost.sql` (thêm phần RPC vào cuối)

- [ ] **Step 1: Thêm RPC ghi đè (giữ chữ ký cũ + tham số mới có default)**

```sql
-- Ghi đè kbit_receive_stock: thêm p_unit_cost (default null → tương thích gọi cũ)
create or replace function kbit_receive_stock(
  p_warehouse_id uuid, p_product_id uuid, p_qty numeric,
  p_txn_date date, p_note text default null, p_created_by uuid default null,
  p_unit_cost numeric default null
) returns void language plpgsql security definer as $$
begin
  perform kbit_adjust_stock(p_warehouse_id, p_product_id, p_qty);
  insert into warehouse_transactions
    (txn_type, warehouse_id, product_id, qty, txn_date, note, created_by, unit_cost)
  values ('receipt', p_warehouse_id, p_product_id, p_qty, p_txn_date, p_note, p_created_by, p_unit_cost);
end $$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0028_inventory_cost.sql
git commit -m "feat(gia-von): kbit_receive_stock ghi unit_cost"
```

### Task 3: Form + action nhập kho thủ công truyền `unit_cost`

**Files:**
- Modify: `features/warehouse/schema.ts` (receiptSchema)
- Modify: `features/warehouse/actions.ts:18-25` (receiveStock)
- Modify: `features/warehouse/components/StockMutationForm.tsx` (ô đơn giá vốn)

- [ ] **Step 1: Thêm `unit_cost` vào receiptSchema**

Trong `features/warehouse/schema.ts`, ở `receiptSchema`, thêm:
```ts
unit_cost: z.coerce.number().nonnegative('Đơn giá vốn ≥ 0').optional().nullable(),
```

- [ ] **Step 2: Truyền p_unit_cost trong receiveStock**

`features/warehouse/actions.ts` — trong `supabase.rpc('kbit_receive_stock', {...})` thêm dòng:
```ts
      p_unit_cost:    data.unit_cost ?? null,
```

- [ ] **Step 3: Thêm ô "Đơn giá vốn" vào form nhập kho**

`StockMutationForm.tsx`: khi loại = nhập (receipt), hiện thêm 1 `<Input type="number" min="0">` gắn state `unitCost`, gửi kèm `unit_cost`. Theo đúng pattern các ô số khác trong form. Nhãn: "Đơn giá vốn (₫/đơn vị)".

- [ ] **Step 4: Build kiểm type**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/warehouse
git commit -m "feat(gia-von): nhap kho thu cong nhap don gia von"
```

### Task 4: Nhập từ đơn mua ghi `unit_cost` vào sổ kho

**Files:**
- Modify: `features/imports/actions.ts:65-72` (khối insert warehouse_transactions trong createImportOrder)

- [ ] **Step 1: Ghi unit_cost từ supplier_order_items**

Trong vòng cộng kho của `createImportOrder` (đang insert `warehouse_transactions` với txn_type='receipt'), thêm `unit_cost: unitCosts[i]` (giá vốn dòng đã phân bổ ở Task imports hiện có — biến `unitCosts` đã tính phía trên trong hàm). Map đúng theo item index.

```ts
      await supabase.from('warehouse_transactions').insert({
        txn_type:     'receipt',
        warehouse_id: data.warehouse_id,
        product_id:   it.product_id,
        qty:          it.qty,
        txn_date:     data.order_date,
        note:         `Nhập từ đơn ${order.id}`,
        unit_cost:    unitCosts[i],     // ← THÊM
      })
```
(Lưu ý: vòng lặp hiện dùng `for (const it of items)` — đổi sang index để lấy `unitCosts[i]`, hoặc tra `unitCosts` theo vị trí item. Giữ logic kho không đổi.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add features/imports/actions.ts
git commit -m "feat(gia-von): nhap tu don mua ghi unit_cost vao so kho"
```

---

## Phase 3 — Số dư đầu kỳ

### Task 5: Action + RPC upsert số dư đầu kỳ

**Files:**
- Modify: `supabase/migrations/0028_inventory_cost.sql` (RPC `kbit_set_opening_stock`)
- Create: `features/inventory-cost/schema.ts`
- Create: `features/inventory-cost/actions.ts`

- [ ] **Step 1: RPC ghi số dư đầu kỳ (upsert thẻ tháng mốc)**

```sql
-- Khai số dư đầu kỳ: ghi qty_open/value_open cho 1 mã ở 1 tháng mốc (chỉ khi thẻ chưa 'closed')
create or replace function kbit_set_opening_stock(
  p_product_id uuid, p_period text, p_qty numeric, p_unit_cost numeric
) returns void language plpgsql security definer as $$
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  insert into inventory_cost_periods (product_id, period, qty_open, value_open)
  values (p_product_id, p_period, p_qty, round(p_qty * p_unit_cost, 2))
  on conflict (product_id, period) do update
    set qty_open = excluded.qty_open, value_open = excluded.value_open
    where inventory_cost_periods.status = 'open';
end $$;
```

- [ ] **Step 2: schema.ts**

```ts
import { z } from 'zod'
export const openingStockSchema = z.object({
  product_id: z.string().uuid('Chọn mã hàng'),
  period:     z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ dạng YYYY-MM'),
  qty:        z.coerce.number().nonnegative('SL ≥ 0'),
  unit_cost:  z.coerce.number().nonnegative('Đơn giá vốn ≥ 0'),
})
export const closePeriodSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) })
```

- [ ] **Step 3: actions.ts — setOpeningStock**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { openingStockSchema } from './schema'

export async function setOpeningStock(input: unknown): Promise<{ error?: string }> {
  const data = openingStockSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.rpc('kbit_set_opening_stock', {
    p_product_id: data.product_id, p_period: data.period,
    p_qty: data.qty, p_unit_cost: data.unit_cost,
  })
  if (error) return { error: error.message }
  revalidatePath('/kho/so-du-dau-ky')
  return {}
}
```

- [ ] **Step 4: Build + Commit**

Run: `npm run build` → PASS
```bash
git add supabase/migrations/0028_inventory_cost.sql features/inventory-cost/schema.ts features/inventory-cost/actions.ts
git commit -m "feat(gia-von): khai so du dau ky kho"
```

### Task 6: UI số dư đầu kỳ

**Files:**
- Create: `app/(app)/kho/so-du-dau-ky/page.tsx` (server: list products + thẻ hiện có)
- Create: `app/(app)/kho/so-du-dau-ky/OpeningBalanceClient.tsx` (form nhập + bảng)

- [ ] **Step 1: Trang + form**

Server page: fetch `listProducts()` + các thẻ `inventory_cost_periods` của kỳ mốc. Client: bảng mã hàng, mỗi dòng ô SL + đơn giá vốn, nút Lưu gọi `setOpeningStock`. Theo pattern form catalog hiện có (`features/products/components/MaHangCatalog.tsx`). Chọn kỳ mốc qua ô `<input type="month">`.

- [ ] **Step 2: Build + chạy thử** (mở `/kho/so-du-dau-ky`, nhập 1 mã, lưu, reload thấy số) → ghi lại kết quả.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/kho/so-du-dau-ky"
git commit -m "feat(gia-von): UI so du dau ky"
```

---

## Phase 4 — Chốt giá vốn cuối tháng

### Task 7: RPC `kbit_close_inventory_cost`

**Files:**
- Modify: `supabase/migrations/0028_inventory_cost.sql`

- [ ] **Step 1: Viết RPC chốt kỳ**

```sql
-- Chốt giá vốn 1 kỳ (tháng): tính BQ từng mã, gán giá vốn xuất + dòng đơn bán, gối đầu sang kỳ sau.
-- Quy ước: NHẬP = warehouse_transactions txn_type IN ('receipt') có unit_cost.
--          XUẤT = txn_type IN ('issue','order_deduction'). Luân chuyển/điều chỉnh KHÔNG tính ở bản đầu.
create or replace function kbit_close_inventory_cost(p_period text)
returns void language plpgsql security definer as $$
declare r record; v_avail numeric; v_avg numeric; v_value_in numeric; v_qty_in numeric;
        v_qty_out numeric; v_value_out numeric; v_next text;
begin
  if not kbit_can_edit() then raise exception 'KHONG_DU_QUYEN'; end if;
  v_next := to_char((to_date(p_period||'-01','YYYY-MM-DD') + interval '1 month'), 'YYYY-MM');

  for r in select id, product_id, qty_open, value_open from inventory_cost_periods
           where period = p_period and status = 'open'
  loop
    -- Nhập trong kỳ (theo product, gộp mọi kho)
    select coalesce(sum(qty),0), coalesce(sum(qty*coalesce(unit_cost,0)),0)
      into v_qty_in, v_value_in
      from warehouse_transactions
      where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
        and txn_type = 'receipt';
    -- Xuất trong kỳ
    select coalesce(sum(qty),0) into v_qty_out
      from warehouse_transactions
      where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
        and txn_type in ('issue','order_deduction');

    v_avail := r.qty_open + v_qty_in;
    v_avg := case when v_avail > 0 then round((r.value_open + v_value_in)/v_avail, 2) else 0 end;
    v_value_out := round(v_qty_out * v_avg, 2);

    update inventory_cost_periods set
      qty_in=v_qty_in, value_in=v_value_in, qty_out=v_qty_out, value_out=v_value_out,
      avg_unit_cost=v_avg, qty_close=r.qty_open+v_qty_in-v_qty_out,
      value_close=round(r.value_open+v_value_in-v_value_out,2),
      status='closed', closed_at=now()
    where id = r.id;

    -- Gán giá vốn cho phiếu xuất trong kỳ
    update warehouse_transactions set unit_cost = v_avg
      where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
        and txn_type in ('issue','order_deduction');

    -- Gán giá vốn dòng đơn bán (qua order_deduction → ref_order_id)
    update customer_order_items coi set cost_price = v_avg
      where coi.product_id = r.product_id and coi.order_id in (
        select distinct ref_order_id from warehouse_transactions
        where product_id = r.product_id and to_char(txn_date,'YYYY-MM') = p_period
          and txn_type = 'order_deduction' and ref_order_id is not null);

    -- Gối đầu: tạo thẻ kỳ sau với tồn đầu = tồn cuối
    insert into inventory_cost_periods (product_id, period, qty_open, value_open)
    values (r.product_id, v_next, r.qty_open+v_qty_in-v_qty_out, round(r.value_open+v_value_in-v_value_out,2))
    on conflict (product_id, period) do update
      set qty_open = excluded.qty_open, value_open = excluded.value_open
      where inventory_cost_periods.status = 'open';
  end loop;
end $$;

grant execute on function kbit_close_inventory_cost(text) to authenticated;
grant execute on function kbit_set_opening_stock(uuid, text, numeric, numeric) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0028_inventory_cost.sql
git commit -m "feat(gia-von): RPC kbit_close_inventory_cost chot ky thang"
```

### Task 8: Action chốt + trang Giá vốn

**Files:**
- Modify: `features/inventory-cost/actions.ts` (closePeriod)
- Create: `features/inventory-cost/queries.ts` (listCostCards)
- Create: `app/(app)/kho/gia-von/page.tsx` + client (nút chốt + bảng thẻ)
- Modify: `lib/nav.ts`

- [ ] **Step 1: Action closePeriod**

```ts
import { closePeriodSchema } from './schema'
export async function closePeriod(input: unknown): Promise<{ error?: string }> {
  const { period } = closePeriodSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.rpc('kbit_close_inventory_cost', { p_period: period })
  if (error) return { error: error.message }
  revalidatePath('/kho/gia-von'); revalidatePath('/bao-cao/lai-gop')
  return {}
}
```

- [ ] **Step 2: queries.ts — listCostCards(period)**

```ts
import { createClient } from '@/lib/supabase/server'
export async function listCostCards(period: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inventory_cost_periods')
    .select('product_id, period, qty_open, value_open, qty_in, value_in, qty_out, value_out, avg_unit_cost, qty_close, value_close, status, products(code, name)')
    .eq('period', period)
    .order('status')
  return data ?? []
}
```

- [ ] **Step 3: Trang `/kho/gia-von`** — chọn kỳ (`<input type="month">`), bảng thẻ giá vốn (mã, tồn đầu, nhập, BQ, xuất, tồn cuối, trạng thái), nút "Chốt giá vốn kỳ này" gọi `closePeriod`. Theo pattern bảng + PageHeader hiện có. Hiện cảnh báo nếu có phiếu nhập trong kỳ thiếu `unit_cost`.

- [ ] **Step 4: nav.ts** — import thêm `Boxes, Coins` từ `lucide-react`; thêm vào nhóm "Kho hàng": `{ href: '/kho/so-du-dau-ky', label: 'Số dư đầu kỳ', icon: Boxes }`, `{ href: '/kho/gia-von', label: 'Giá vốn & chốt kỳ', icon: Coins }`.

- [ ] **Step 5: Build + chạy thử** (tạo nhập có đơn giá + 1 đơn bán trừ kho trong 1 tháng → bấm chốt → thẻ 'closed', đơn bán có cost_price). Ghi kết quả.

- [ ] **Step 6: Commit**

```bash
git add features/inventory-cost "app/(app)/kho/gia-von" lib/nav.ts
git commit -m "feat(gia-von): nut chot gia von + trang the gia von + menu"
```

---

## Phase 5 — Báo cáo lãi gộp 3 mức

### Task 9: queries lãi gộp + trang báo cáo

**Files:**
- Modify: `features/inventory-cost/queries.ts` (grossProfit*)
- Create: `app/(app)/bao-cao/lai-gop/page.tsx` + `GrossProfitClient.tsx`
- Modify: `lib/nav.ts` (mục "Lãi gộp" nhóm Tổng quan)

- [ ] **Step 1: queries lãi gộp 3 mức**

```ts
// Lãi gộp = Σ qty*(unit_price - cost_price) trên customer_order_items đã có cost_price (đã chốt),
// chỉ đơn bán có trừ kho (cost_price not null), trong kỳ p (theo order_date).
export async function grossProfit(period: string) {
  const supabase = await createClient()
  // Lấy dòng bán đã chốt giá vốn trong kỳ (join customer_orders để lọc order_date + lấy mã đơn)
  const { data } = await supabase
    .from('customer_order_items')
    .select('product_id, qty, unit_price, cost_price, products(code,name), customer_orders!inner(order_code, order_date)')
    .not('cost_price', 'is', null)
  const rows = (data ?? []).filter((r: any) => (r.customer_orders?.order_date ?? '').slice(0,7) === period)
  // map -> { byOrder, byProduct, total } : tính revenue/cogs/profit. (logic gộp thuần)
  return summarizeGrossProfit(rows)
}
```
+ Hàm thuần `summarizeGrossProfit(rows)` trong `avg-cost.ts` (test được): trả `{ total:{revenue,cogs,profit}, byProduct:[...], byOrder:[...] }`.

- [ ] **Step 2: Test thuần cho summarizeGrossProfit** (thêm vào `avg-cost.test.ts`): 2 dòng 2 đơn 2 mã → kiểm tổng + nhóm. FAIL → implement → PASS.

- [ ] **Step 3: Trang `/bao-cao/lai-gop`** — chọn kỳ; 3 bảng/tab: Tổng tháng (revenue, cogs, lãi gộp, %), Theo mã, Theo đơn. Cảnh báo "kỳ chưa chốt → chưa có lãi gộp".

- [ ] **Step 4: nav.ts** import thêm `TrendingUp` từ `lucide-react`; thêm vào nhóm "Tổng quan": `{ href: '/bao-cao/lai-gop', label: 'Lãi gộp', icon: TrendingUp }`.

- [ ] **Step 5: Build + test + chạy thử** → ghi kết quả.

- [ ] **Step 6: Commit**

```bash
git add features/inventory-cost "app/(app)/bao-cao/lai-gop" lib/nav.ts
git commit -m "feat(gia-von): bao cao lai gop 3 muc"
```

---

## Kiểm chứng tổng (cuối cùng)

- [ ] `npm run build` xanh.
- [ ] `npx vitest run features/inventory-cost` — toàn bộ test thuần PASS.
- [ ] `npm run test` — test cũ KHÔNG vỡ (7 fail integration do thiếu env Supabase là sẵn có).
- [ ] Chạy thử app (login KTT) trên 1 mã: khai số dư đầu → nhập có đơn giá → bán trừ kho → chốt kỳ → xem lãi gộp khớp tay. Dọn dữ liệu test sau khi xong (qua admin/dashboard nếu KTT không xoá được).

## Lưu ý thực thi
- Migration đụng DB thật → chỉ admin deploy. Local kiểm cú pháp qua harness PGlite (D:\tmp\kbit-local) nếu có.
- Cột mới nullable + RPC mới → KHÔNG ảnh hưởng luồng kho/bán đang chạy.
- Bản đầu CHƯA tính giá vốn cho `transfer`/`adjustment` (ghi rõ ở UI). Mở rộng sau nếu cần.
