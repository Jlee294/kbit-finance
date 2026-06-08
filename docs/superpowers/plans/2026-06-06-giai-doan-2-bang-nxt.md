# Giai đoạn 2 — Bảng Nhập-Xuất-Tồn — Implementation Plan

> **For agentic workers:** thực thi task-by-task, mỗi task có test/verify. Checkbox `- [ ]`.

**Goal:** Dựng bảng NXT theo tháng trên trang `/kho`: Tồn đầu / Nhập / Xuất / Tồn cuối (Số lượng + Thành tiền) + Đơn giá BQ, lọc theo kho — suy từ sổ cái, khớp giá vốn liên hoàn (G1).

**Architecture:** 1 RPC SQL `kbit_inventory_nxt(period, warehouse_id?)` cộng dồn `warehouse_transactions.unit_cost` (cùng quy ước §4.2.bis). Lọc 1 kho → transfer tính vào Nhập/Xuất kho; xem tổng → bỏ transfer (net 0). Chỉ trả mã có hoạt động/tồn. UI server-component query theo `?period`/`?wh`, client đổi bộ lọc qua router.push (pattern như `so-du-dau-ky`).

**Tech Stack:** PostgreSQL (plpgsql/sql RPC), Next.js server/client component, Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-06-06-gia-von-lien-hoan-va-bang-nxt-design.md` §5.

---

## Task 1: RPC `kbit_inventory_nxt` + test PGlite

**Files:** Create `supabase/migrations/0031_inventory_nxt.sql`, `supabase/tests/inventory_nxt.test.ts`

- [ ] **Step 1: Viết migration 0031**

```sql
-- KBIT 0031 — Bảng Nhập-Xuất-Tồn theo kỳ (đọc, suy từ sổ cái; khớp giá vốn liên hoàn 0030).
-- p_warehouse_id NULL = tổng mọi kho (BỎ luân chuyển, net 0). Có kho = transfer tính vào Nhập/Xuất kho.
-- Tồn đầu = cộng dồn tới trước period-01 + 'opening' của chính kỳ. Chỉ trả mã có hoạt động/tồn.
create or replace function kbit_inventory_nxt(p_period text, p_warehouse_id uuid default null)
returns table (
  product_id uuid, code text, name text, unit text,
  qty_open numeric, value_open numeric, qty_in numeric, value_in numeric,
  qty_out numeric, value_out numeric, qty_close numeric, value_close numeric, avg_cost numeric
) language sql stable security definer set search_path = public as $$
  with vstart as (select to_date(p_period||'-01','YYYY-MM-DD') d),
  vend as (select (to_date(p_period||'-01','YYYY-MM-DD') + interval '1 month')::date d),
  base as (
    select wt.product_id, wt.txn_type::text tt, wt.txn_date, wt.qty, coalesce(wt.unit_cost,0) uc
    from warehouse_transactions wt, vend
    where wt.product_id is not null
      and (p_warehouse_id is null or wt.warehouse_id = p_warehouse_id)
      and wt.txn_date < vend.d
  ),
  agg as (
    select b.product_id,
      sum(case when (b.txn_date < (select d from vstart)
                     or (b.tt='opening' and to_char(b.txn_date,'YYYY-MM')=p_period))
               then (case when b.tt in ('receipt','transfer_in','opening') then b.qty
                          when b.tt in ('issue','order_deduction','transfer_out') then -b.qty else 0 end) else 0 end) qty_open,
      sum(case when (b.txn_date < (select d from vstart)
                     or (b.tt='opening' and to_char(b.txn_date,'YYYY-MM')=p_period))
               then (case when b.tt in ('receipt','transfer_in','opening') then b.qty*b.uc
                          when b.tt in ('issue','order_deduction','transfer_out') then -b.qty*b.uc else 0 end) else 0 end) value_open,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt='receipt' or (p_warehouse_id is not null and b.tt='transfer_in')) then b.qty else 0 end) qty_in,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt='receipt' or (p_warehouse_id is not null and b.tt='transfer_in')) then b.qty*b.uc else 0 end) value_in,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt in ('issue','order_deduction') or (p_warehouse_id is not null and b.tt='transfer_out')) then b.qty else 0 end) qty_out,
      sum(case when to_char(b.txn_date,'YYYY-MM')=p_period
                and (b.tt in ('issue','order_deduction') or (p_warehouse_id is not null and b.tt='transfer_out')) then b.qty*b.uc else 0 end) value_out
    from base b group by b.product_id
  )
  select a.product_id, p.code, p.name, p.unit,
    a.qty_open, round(a.value_open,2), a.qty_in, round(a.value_in,2),
    a.qty_out, round(a.value_out,2),
    a.qty_open+a.qty_in-a.qty_out, round(a.value_open+a.value_in-a.value_out,2),
    case when (a.qty_open+a.qty_in-a.qty_out) > 0
         then round((a.value_open+a.value_in-a.value_out)/(a.qty_open+a.qty_in-a.qty_out),2) else 0 end
  from agg a join products p on p.id = a.product_id
  where a.qty_open <> 0 or a.qty_in <> 0 or a.qty_out <> 0 or (a.qty_open+a.qty_in-a.qty_out) <> 0
  order by p.code;
$$;
grant execute on function kbit_inventory_nxt(text, uuid) to authenticated;
```

- [ ] **Step 2: Viết test `supabase/tests/inventory_nxt.test.ts`** (theo mẫu moving_average_cost.test.ts — copy beforeAll/helper, thêm)

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, whVN: string, whKR: string, userId: string
async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params); return Object.values(r.rows[0])[0]
}
let seq = 0
async function freshProduct(): Promise<string> {
  seq += 1; return val<string>(`insert into products(code,name,unit) values ($1,$2,'cái') returning id`, [`NXT-${seq}`, `SP ${seq}`])
}
const receive = (wh: string, p: string, n: number, c: number | null, d: string) =>
  db.query(`select kbit_receive_stock($1,$2,$3,$4::date,'r',$5,$6)`, [wh, p, n, d, userId, c])
const issue = (wh: string, p: string, n: number, d: string) =>
  db.query(`select kbit_issue_stock($1,$2,$3,'sale'::issue_reason,$4::date,'i',$5)`, [wh, p, n, d, userId])
const transfer = (a: string, b: string, p: string, n: number, d: string) =>
  db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,$5::date,'t',$6)`, [a, b, p, n, d, userId])
const opening = (p: string, wh: string, period: string, n: number, c: number) =>
  db.query(`select kbit_set_opening_stock($1,$2,$3,$4,$5)`, [p, wh, period, n, c])
async function nxt(period: string, wh: string | null, productId: string) {
  const r = await db.query<Record<string, string>>(`select * from kbit_inventory_nxt($1,$2) where product_id=$3`, [period, wh, productId])
  return r.rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select '${FIXED_UID}'::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  for (const f of readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort())
    await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))
  userId = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'K','k@t.local','chief_accountant') returning id`, [FIXED_UID])
  await db.query(`insert into companies(code,name,country,base_currency) values ('T','T','VN','VND')`)
  whVN = await val<string>(`select id from warehouses where code='KHO-VN'`)
  whKR = await val<string>(`select id from warehouses where code='KHO-KR'`)
}, 180_000)

describe('kbit_inventory_nxt — bảng Nhập-Xuất-Tồn', () => {
  it('tổng: opening đầu kỳ + nhập + xuất ra số đúng', async () => {
    const p = await freshProduct()
    await opening(p, whVN, '2026-09', 100, 50)        // tồn đầu 100@50 = 5000
    await receive(whVN, p, 20, 60, '2026-09-10')      // nhập 20@60 = 1200
    await issue(whVN, p, 30, '2026-09-15')            // xuất 30 @ avg... avg sau nhập=(5000+1200)/120=51.67
    const r = await nxt('2026-09', null, p)
    expect(Number(r.qty_open)).toBe(100); expect(Number(r.value_open)).toBe(5000)
    expect(Number(r.qty_in)).toBe(20);   expect(Number(r.value_in)).toBe(1200)
    expect(Number(r.qty_out)).toBe(30)
    expect(Number(r.qty_close)).toBe(90)
    // bảo toàn: value_open+value_in = value_out+value_close
    expect(Number(r.value_open) + Number(r.value_in)).toBeCloseTo(Number(r.value_out) + Number(r.value_close), 2)
  })
  it('TỔNG mọi kho: luân chuyển KHÔNG vào Nhập/Xuất (net 0)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 10, '2026-09-02')
    await transfer(whVN, whKR, p, 40, '2026-09-12')   // nội bộ
    const r = await nxt('2026-09', null, p)
    expect(Number(r.qty_in)).toBe(100)                // chỉ receipt
    expect(Number(r.qty_out)).toBe(0)                 // transfer KHÔNG vào xuất
    expect(Number(r.qty_close)).toBe(100)
  })
  it('LỌC 1 kho: transfer_in = nhập kho đích, transfer_out = xuất kho nguồn', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 10, '2026-09-02')
    await transfer(whVN, whKR, p, 40, '2026-09-12')
    const vn = await nxt('2026-09', whVN, p)
    expect(Number(vn.qty_in)).toBe(100); expect(Number(vn.qty_out)).toBe(40); expect(Number(vn.qty_close)).toBe(60)
    const kr = await nxt('2026-09', whKR, p)
    expect(Number(kr.qty_in)).toBe(40); expect(Number(kr.qty_out)).toBe(0); expect(Number(kr.qty_close)).toBe(40)
  })
  it('mã không hoạt động trong kỳ → KHÔNG xuất hiện', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 10, '2026-05-01')      // chỉ phát sinh tháng 5
    const r = await db.query(`select * from kbit_inventory_nxt('2026-09', null) where product_id=$1`, [p])
    // tháng 9: tồn đầu = 10 (mang sang) → CÓ xuất hiện vì tồn đầu ≠ 0
    expect(r.rows.length).toBe(1)
    const p2 = await freshProduct()                    // không phát sinh gì
    const r2 = await db.query(`select * from kbit_inventory_nxt('2026-09', null) where product_id=$1`, [p2])
    expect(r2.rows.length).toBe(0)
  })
})
```

- [ ] **Step 3: Chạy test** — `cd "D:/Finance System/kbit" && npx vitest run supabase/tests/inventory_nxt.test.ts` → kỳ vọng 4 passed. Sửa migration nếu đỏ.

---

## Task 2: Query + UI bảng NXT trên trang Kho

**Files:** Modify `features/warehouse/queries.ts` (thêm `listInventoryNxt`), Create `features/warehouse/components/NxtTable.tsx`, Modify `app/(app)/kho/page.tsx`

- [ ] **Step 1: Thêm query `listInventoryNxt` vào `features/warehouse/queries.ts`**

```typescript
export interface NxtRow {
  product_id: string; code: string; name: string; unit: string | null
  qty_open: number; value_open: number; qty_in: number; value_in: number
  qty_out: number; value_out: number; qty_close: number; value_close: number; avg_cost: number
}

export async function listInventoryNxt(period: string, warehouseId?: string): Promise<NxtRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('kbit_inventory_nxt', {
    p_period: period,
    p_warehouse_id: warehouseId ?? null,
  })
  if (error) { console.error('[listInventoryNxt]', error.message); return [] }
  return ((data ?? []) as any[]).map(r => ({
    product_id: r.product_id, code: r.code, name: r.name, unit: r.unit,
    qty_open: Number(r.qty_open), value_open: Number(r.value_open),
    qty_in: Number(r.qty_in), value_in: Number(r.value_in),
    qty_out: Number(r.qty_out), value_out: Number(r.value_out),
    qty_close: Number(r.qty_close), value_close: Number(r.value_close), avg_cost: Number(r.avg_cost),
  }))
}
```

- [ ] **Step 2: Tạo `features/warehouse/components/NxtTable.tsx`**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/format'
import type { NxtRow, Warehouse } from '../queries'

const num = (n: number) => n.toLocaleString('vi-VN')

export function NxtTable({ period, warehouseId, warehouses, rows }: {
  period: string; warehouseId: string; warehouses: Warehouse[]; rows: NxtRow[]
}) {
  const router = useRouter()
  const go = (p: string, wh: string) => router.push(`/kho?period=${p}&wh=${wh}`)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Kỳ</label>
          <input type="month" value={period} onChange={e => go(e.target.value, warehouseId)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Kho</label>
          <select value={warehouseId} onChange={e => go(period, e.target.value)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm">
            <option value="all">Tất cả kho</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Không có phát sinh/tồn trong kỳ {period}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50/60 text-xs text-brand-800 font-semibold">
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Mã hàng</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Tồn đầu kỳ</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Nhập trong kỳ</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Xuất trong kỳ</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Tồn cuối kỳ</th>
                <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l">Đơn giá BQ</th>
              </tr>
              <tr className="border-b border-brand-100 bg-brand-50/40 text-[11px] text-brand-700 font-medium">
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => {
                const neg = r.qty_close < 0
                return (
                  <tr key={r.product_id} className={`hover:bg-brand-50/40 ${neg ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2"><p className="font-medium text-gray-800">{r.name}</p><p className="text-xs text-gray-400">{r.code}</p></td>
                    <td className="px-3 py-2 text-right border-l">{num(r.qty_open)}</td><td className="px-3 py-2 text-right text-gray-600">{formatVND(r.value_open)}</td>
                    <td className="px-3 py-2 text-right border-l">{num(r.qty_in)}</td><td className="px-3 py-2 text-right text-gray-600">{formatVND(r.value_in)}</td>
                    <td className="px-3 py-2 text-right border-l">{num(r.qty_out)}</td><td className="px-3 py-2 text-right text-gray-600">{formatVND(r.value_out)}</td>
                    <td className={`px-3 py-2 text-right border-l font-semibold ${neg ? 'text-red-600' : 'text-gray-800'}`}>{num(r.qty_close)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatVND(r.value_close)}</td>
                    <td className="px-3 py-2 text-right border-l text-gray-600">{formatVND(r.avg_cost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Sửa `app/(app)/kho/page.tsx`** (giữ 4 nút điều hướng cũ — G3 đổi; thay StockTable → NxtTable)

```typescript
import Link from 'next/link'
import { listWarehouses, listInventoryNxt } from '@/features/warehouse/queries'
import { NxtTable } from '@/features/warehouse/components/NxtTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { todayLocal } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function KhoPage({ searchParams }: { searchParams: Promise<{ period?: string; wh?: string }> }) {
  const sp = await searchParams
  const period = sp.period || todayLocal().slice(0, 7)
  const wh = sp.wh && sp.wh !== 'all' ? sp.wh : undefined
  const [warehouses, rows] = await Promise.all([listWarehouses(), listInventoryNxt(period, wh)])
  const negative = rows.filter(r => r.qty_close < 0)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Kho hàng"
        subtitle={
          <>
            {rows.length} mặt hàng · {warehouses.length} kho
            {negative.length > 0 && (
              <span className="ml-2 text-red-600 font-medium">⚠ {negative.length} mặt hàng tồn âm</span>
            )}
          </>
        }
        actions={
          <>
            <Link href="/kho/nhap" className="h-9 px-3.5 bg-success-500 text-white rounded-lg text-sm font-medium hover:bg-success-700 transition-colors flex items-center">Nhập kho</Link>
            <Link href="/kho/xuat" className="h-9 px-3.5 bg-danger-500 text-white rounded-lg text-sm font-medium hover:bg-danger-700 transition-colors flex items-center">Xuất kho</Link>
            <Link href="/kho/luan-chuyen" className="h-9 px-3.5 bg-brand-800 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center">Luân chuyển</Link>
            <Link href="/kho/lich-su" className="h-9 px-3.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center">Lịch sử</Link>
          </>
        }
      />
      <NxtTable period={period} warehouseId={sp.wh || 'all'} warehouses={warehouses} rows={rows} />
    </div>
  )
}
```

- [ ] **Step 4: tsc** — `npx tsc --noEmit 2>&1 | grep -iE "warehouse|kho/page|NxtTable"` → trống.

---

## Task 3: Verify + review độc lập + commit

- [ ] **Step 1:** `npx vitest run supabase/tests/inventory_nxt.test.ts supabase/tests/moving_average_cost.test.ts` → tất cả xanh (G2 không vỡ G1).
- [ ] **Step 2:** Review độc lập (requesting-code-review) tập trung RPC kbit_inventory_nxt (đúng quy ước transfer theo kho/tổng; opening; bảo toàn; lọc mã). Vá BLOCKER.
- [ ] **Step 3:** Cập nhật memory. Commit RIÊNG file G2 (`git add` từng path: 0031, inventory_nxt.test.ts, queries.ts, NxtTable.tsx, kho/page.tsx, spec, plan).

## Mở ngỏ G2/G3
- Nút "Chốt kỳ / Khóa sổ" + popup nhập/xuất/luân chuyển + dọn menu + redirect 3 route cũ → **G3**.
- `adjustment` vào snapshot/NXT (từ G1) — cân nhắc khi cần đối soát chính xác sau sửa đơn.
