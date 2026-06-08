# Giai đoạn A — Nền dữ liệu kho ĐA CÔNG TY — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development hoặc executing-plans. Steps dùng checkbox.

**Goal:** Thêm chiều CÔNG TY vào nền dữ liệu kho/giá vốn — mỗi công ty tồn kho + giá vốn riêng, không trộn; khóa kỳ kho theo công ty. Chỉ migration + test, KHÔNG đổi UI/TS.

**Architecture:** Kho gắn `company_id`; mọi RPC kho **suy công ty từ kho** (`warehouses.company_id`) nên giữ nguyên chữ ký (caller TS không đổi). Giá vốn BQ (`product_moving_cost`) + snapshot (`inventory_cost_periods`) đổi khóa theo `(company_id, product_id[, period])`. `warehouse_transactions` mang `company_id` (denormalized) → trigger khóa kỳ kho dùng `kbit_assert_period_open`. `kbit_inventory_nxt`/`kbit_close_inventory_cost` thêm `p_company_id` **optional** (null = gộp như cũ → UI hiện tại không vỡ; GĐ C truyền công ty).

**Tech Stack:** PostgreSQL (plpgsql), Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-06-06-tach-kho-da-cong-ty-design.md`.

---

## File Structure
- Create: `supabase/migrations/0033_warehouse_multi_company.sql` — toàn bộ thay đổi schema + RPC (single source of truth cho SQL).
- Create: `supabase/tests/multi_company_warehouse.test.ts` — test tách công ty (mới).
- Modify: các test PGlite cũ nếu đỏ sau 0033 (`moving_average_cost`, `inventory_nxt`, `e2e_inventory_flow`, `adjustment_flow`, `warehouse_stock_negative_check`) — seed kho đã có company (migration tự gán), chủ yếu chỉ cần kiểm chạy lại.

---

## Task 1: Migration 0033 — Schema + di trú + trigger khóa kỳ kho

**Files:** Create `supabase/migrations/0033_warehouse_multi_company.sql` (phần A)

- [ ] **Step 1: Viết phần schema + di trú** (đầu file 0033):

```sql
-- ============ KBIT 0033 — KHO ĐA CÔNG TY ============
-- Mỗi công ty tồn kho + giá vốn riêng. Kho gắn company_id; RPC suy company từ kho.
-- Spec: docs/superpowers/specs/2026-06-06-tach-kho-da-cong-ty-design.md
-- Chưa có dữ liệu thật trên cloud → di trú nhẹ (gán 3 kho seed cho công ty đầu MINTVN).

-- 1) warehouses + company_id; unique đổi (company_id, code)
alter table warehouses add column if not exists company_id uuid references companies(id);
update warehouses set company_id = (select id from companies order by created_at, code limit 1)
  where company_id is null;                       -- gán tạm cho công ty đầu (MINTVN)
alter table warehouses alter column company_id set not null;
alter table warehouses drop constraint if exists warehouses_code_key;   -- unique(code) cũ
create unique index if not exists warehouses_company_code_key on warehouses(company_id, code);

-- 2) warehouse_transactions + company_id (denormalized từ kho)
alter table warehouse_transactions add column if not exists company_id uuid references companies(id);
update warehouse_transactions wt set company_id = w.company_id
  from warehouses w where w.id = wt.warehouse_id and wt.company_id is null;
-- không set NOT NULL ngay: RPC luôn điền; cho phép null lịch sử an toàn. (Cân nhắc NOT NULL sau backfill.)
create index if not exists idx_wtxn_company_date on warehouse_transactions(company_id, txn_date);

-- 3) product_moving_cost: khóa theo (company_id, product_id). Chưa data thật → tạo lại sạch.
drop table if exists product_moving_cost;
create table product_moving_cost (
  company_id  uuid not null references companies(id),
  product_id  uuid not null references products(id),
  qty_on_hand numeric(18,3) not null default 0,
  avg_cost    numeric(18,2) not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (company_id, product_id)
);
alter table product_moving_cost enable row level security;
create policy pmc_sel on product_moving_cost for select to authenticated using (true);
create policy pmc_ins on product_moving_cost for insert to authenticated with check (kbit_can_edit());
create policy pmc_upd on product_moving_cost for update to authenticated using (kbit_can_edit());

-- 4) inventory_cost_periods: unique theo (company_id, product_id, period)
alter table inventory_cost_periods add column if not exists company_id uuid references companies(id);
update inventory_cost_periods set company_id = (select id from companies order by created_at, code limit 1)
  where company_id is null;
alter table inventory_cost_periods drop constraint if exists inventory_cost_periods_product_id_period_key;
create unique index if not exists icp_company_product_period_key
  on inventory_cost_periods(company_id, product_id, period);

-- 5) Trigger khóa kỳ KHO: chặn ghi warehouse_transactions vào kỳ công ty đã khóa
create or replace function kbit_lock_guard_wtxn()
returns trigger language plpgsql as $$
begin
  perform kbit_assert_period_open(new.company_id, new.txn_date);
  if tg_op = 'UPDATE' then
    perform kbit_assert_period_open(old.company_id, old.txn_date);
  end if;
  return new;
end $$;
drop trigger if exists trg_wtxn_lock on warehouse_transactions;
create trigger trg_wtxn_lock
  before insert or update on warehouse_transactions
  for each row execute function kbit_lock_guard_wtxn();
```

- [ ] **Step 2: Sanity** — sẽ kiểm khi chạy test Task 3 (apply toàn bộ migration). Nếu lỗi `drop table product_moving_cost` do FK → kiểm không bảng nào FK tới nó (chỉ RPC dùng) → an toàn.

---

## Task 2: Migration 0033 — RPC theo công ty (phần B, nối tiếp file)

**Nguyên tắc:** mỗi RPC kho lookup `v_company := (select company_id from warehouses where id = p_warehouse_id)`; truyền vào helper + ghi `company_id` vào sổ. Helper `kbit_mc_*` thêm `p_company_id`. `transfer` assert from/to cùng công ty. `nxt`/`close` thêm `p_company_id` optional.

- [ ] **Step 1: Helper mc_* theo công ty** — `create or replace`:

```sql
create or replace function kbit_mc_receive(p_company_id uuid, p_product_id uuid, p_qty numeric, p_unit_cost numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_qty numeric := 0; v_avg numeric := 0; v_u numeric; v_newqty numeric; v_newavg numeric;
begin
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
  select qty_on_hand, avg_cost into v_qty, v_avg from product_moving_cost
    where company_id = p_company_id and product_id = p_product_id;
  if not found then v_qty := 0; v_avg := 0; end if;
  insert into product_moving_cost(company_id, product_id, qty_on_hand, avg_cost, updated_at)
    values (p_company_id, p_product_id, v_qty - p_qty, v_avg, now())
  on conflict (company_id, product_id) do update set qty_on_hand = v_qty - p_qty, updated_at = now();
  return round(v_avg, 2);
end $$;
```

- [ ] **Step 2: receive/issue/deduct/adjust/opening** — mỗi hàm thêm `declare v_company uuid;` + `select company_id into v_company from warehouses where id = p_warehouse_id;` (đầu, sau check quyền); đổi `kbit_mc_receive(p_product_id,...)` → `kbit_mc_receive(v_company, p_product_id,...)` (tương tự mc_issue); thêm `company_id` (= v_company) vào mọi `insert into warehouse_transactions`. Giữ NGUYÊN chữ ký ngoài (caller TS không đổi). Viết lại đầy đủ 5 hàm trong 0033 dựa bản hiện tại (đã trích) + 3 sửa trên.

- [ ] **Step 3: transfer** — `kbit_transfer_stock_full`: thêm `v_company uuid; v_to_company uuid;` lookup cả 2 kho; `if v_company <> v_to_company then raise exception 'LUAN_CHUYEN_KHAC_CTY: Chỉ luân chuyển trong cùng công ty'; end if;` đọc avg theo `(v_company, p_product_id)`; ghi `company_id=v_company` cho cả 2 dòng.

- [ ] **Step 4: nxt + close thêm p_company_id optional**:
  - `kbit_inventory_nxt(p_period text, p_warehouse_id uuid default null, p_company_id uuid default null)`: thêm điều kiện `base` `(p_company_id is null or wt.company_id = p_company_id)`.
  - `kbit_close_inventory_cost(p_period text, p_company_id uuid default null)`: vòng lặp + các select thêm `(p_company_id is null or company_id = p_company_id)`; snapshot ghi `company_id` (= p_company_id, hoặc suy từ giao dịch); `on conflict (company_id, product_id, period)`. Khi p_company_id null → giữ hành vi gộp (tương thích).

- [ ] **Step 5: Commit** sau khi Task 3 xanh (xem Task 4).

---

## Task 3: Test tách công ty (PGlite)

**Files:** Create `supabase/tests/multi_company_warehouse.test.ts`

- [ ] **Step 1: Viết test** — seed 2 công ty (A, B), mỗi công ty 1 kho, CÙNG 1 mã hàng; verify tách:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (s: string) => s.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, coA: string, coB: string, whA: string, whA2: string, whB: string, userId: string, P: string
async function val<T = string>(sql: string, p: unknown[] = []): Promise<T> { const r = await db.query<Record<string, T>>(sql, p); return Object.values(r.rows[0])[0] }
const receive = (wh: string, n: number, c: number, d: string) => db.query(`select kbit_receive_stock($1,$2,$3,$4::date,'r',$5,$6)`, [wh, P, n, d, userId, c])
const issue = (wh: string, n: number, d: string) => db.query(`select kbit_issue_stock($1,$2,$3,'sale'::issue_reason,$4::date,'i',$5)`, [wh, P, n, d, userId])
const transfer = (a: string, b: string, n: number, d: string) => db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,$5::date,'t',$6)`, [a, b, P, n, d, userId])
async function mc(co: string): Promise<{ qty: number; avg: number }> {
  const r = await db.query<{ qty_on_hand: string; avg_cost: string }>(`select qty_on_hand,avg_cost from product_moving_cost where company_id=$1 and product_id=$2`, [co, P])
  return r.rows[0] ? { qty: Number(r.rows[0].qty_on_hand), avg: Number(r.rows[0].avg_cost) } : { qty: 0, avg: 0 }
}
async function nxtClose(period: string, co: string): Promise<number> {
  const r = await db.query<Record<string, string>>(`select qty_close from kbit_inventory_nxt($1,null,$2) where product_id=$3`, [period, co, P])
  return r.rows[0] ? Number(r.rows[0].qty_close) : 0
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select '${FIXED_UID}'::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  for (const f of readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort()) await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))
  userId = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'K','k@t.local','chief_accountant') returning id`, [FIXED_UID])
  coA = await val<string>(`insert into companies(code,name,country,base_currency) values ('COA','Cty A','VN','VND') returning id`)
  coB = await val<string>(`insert into companies(code,name,country,base_currency) values ('COB','Cty B','VN','VND') returning id`)
  whA = await val<string>(`insert into warehouses(code,name,company_id) values ('K1','Kho A1',$1) returning id`, [coA])
  whA2 = await val<string>(`insert into warehouses(code,name,company_id) values ('K2','Kho A2',$1) returning id`, [coA])
  whB = await val<string>(`insert into warehouses(code,name,company_id) values ('K1','Kho B1',$1) returning id`, [coB]) // trùng code K1 nhưng khác cty → OK (unique theo company)
  P = await val<string>(`insert into products(code,name,unit) values ('SP','SP chung','cai') returning id`)
})

describe('Kho đa công ty — tách riêng từng công ty', () => {
  it('cùng 1 mã: giá vốn BQ + tồn của 2 công ty TÁCH RIÊNG, không trộn', async () => {
    await receive(whA, 10, 100, '2026-10-01')   // Cty A: 10 @100
    await receive(whB, 10, 300, '2026-10-01')   // Cty B: 10 @300 (cùng mã, giá khác)
    expect(await mc(coA)).toEqual({ qty: 10, avg: 100 })
    expect(await mc(coB)).toEqual({ qty: 10, avg: 300 })   // KHÔNG trộn thành 200
    await issue(whA, 4, '2026-10-05')
    expect(await mc(coA)).toEqual({ qty: 6, avg: 100 })
    expect(await mc(coB)).toEqual({ qty: 10, avg: 300 })   // Cty B không đổi
  })
  it('NXT tách theo công ty: tồn cuối A vs B độc lập', async () => {
    expect(await nxtClose('2026-10', coA)).toBe(6)
    expect(await nxtClose('2026-10', coB)).toBe(10)
  })
  it('mã trùng code kho khác công ty: unique (company, code) cho phép', async () => {
    // whA code 'K1' và whB code 'K1' đã tạo ở beforeAll — không lỗi unique
    const n = await val<string>(`select count(*)::text from warehouses where code='K1'`)
    expect(Number(n)).toBe(2)
  })
  it('luân chuyển CHÉO công ty bị CHẶN', async () => {
    await expect(transfer(whA, whB, 1, '2026-10-10')).rejects.toThrow(/LUAN_CHUYEN_KHAC_CTY|cùng công ty/)
  })
  it('luân chuyển trong CÙNG công ty (A1→A2) OK', async () => {
    await expect(transfer(whA, whA2, 2, '2026-10-12')).resolves.toBeDefined()
  })
  it('khóa kỳ công ty A chặn ghi kho A, KHÔNG chặn công ty B', async () => {
    await db.query(`insert into accounting_periods(company_id,period,status) values ($1,'2026-11','locked')`, [coA])
    await expect(receive(whA, 5, 100, '2026-11-02')).rejects.toThrow(/KY_DA_KHOA|đã khóa/)
    await expect(receive(whB, 5, 300, '2026-11-02')).resolves.toBeDefined()  // B chưa khóa
  })
})
```

- [ ] **Step 2: Chạy** — `cd "D:/Finance System/kbit" && npx vitest run supabase/tests/multi_company_warehouse.test.ts` → 6 ca xanh. Sửa 0033 nếu đỏ.

---

## Task 4: Verify toàn bộ + cập nhật test cũ + review + commit

- [ ] **Step 1:** Chạy TOÀN BỘ test kho/giá vốn: `npx vitest run supabase/tests/ features/inventory-cost/`. Test cũ (1 công ty, kho seed gán MINTVN) phần lớn vẫn xanh vì RPC suy company từ kho. Sửa ca đỏ: nếu test cũ đọc `product_moving_cost where product_id=` → thêm company, hoặc dùng kho có company. Mục tiêu: TẤT CẢ xanh.
- [ ] **Step 2:** `npx tsc --noEmit` — không lỗi mới (GĐ A không đổi TS; nxt/close thêm param optional cuối → caller cũ vẫn hợp lệ).
- [ ] **Step 3:** Review độc lập (requesting-code-review) tập trung 0033: tách company đúng (mc/nxt/close theo company), transfer chặn chéo, trigger khóa kỳ kho, di trú seed, không trộn 2 công ty. Vá BLOCKER.
- [ ] **Step 4:** Commit RIÊNG file GĐ A (`git add` 0033 + multi_company_warehouse.test.ts + test cũ sửa + plan/spec). Cập nhật memory.

## Tiêu chí hoàn thành GĐ A (từ spec §8)
- [ ] 0033 apply sạch (di trú seed kho).
- [ ] 2 công ty cùng mã: giá vốn/tồn/NXT/snapshot tách riêng (test).
- [ ] Luân chuyển chéo công ty bị chặn (test).
- [ ] Ghi kho vào kỳ công ty đã khóa bị chặn; công ty khác không (test).
- [ ] Toàn bộ test cũ XANH; tsc 0 lỗi mới.
- [ ] Review độc lập hết BLOCKER.
