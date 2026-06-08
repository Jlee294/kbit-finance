// =====================================================================
// Test KHO ĐA CÔNG TY (migration 0033): mỗi công ty tồn kho + giá vốn RIÊNG.
// Kiểm: cùng 1 mã hàng → giá vốn/tồn/NXT/snapshot 2 công ty TÁCH, không trộn;
//   luân chuyển chỉ trong cùng công ty; khóa kỳ kho theo công ty; unique (cty,code).
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (s: string) => s.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, coA: string, coB: string, whA: string, whA2: string, whB: string, userId: string, P: string

async function val<T = string>(sql: string, p: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, p); return Object.values(r.rows[0])[0]
}
const receive = (wh: string, n: number, c: number, d: string) =>
  db.query(`select kbit_receive_stock($1,$2,$3,$4::date,'r',$5,$6)`, [wh, P, n, d, userId, c])
const issue = (wh: string, n: number, d: string) =>
  db.query(`select kbit_issue_stock($1,$2,$3,'sale'::issue_reason,$4::date,'i',$5)`, [wh, P, n, d, userId])
const transfer = (a: string, b: string, n: number, d: string) =>
  db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,$5::date,'t',$6)`, [a, b, P, n, d, userId])
async function mc(co: string): Promise<{ qty: number; avg: number }> {
  const r = await db.query<{ qty_on_hand: string; avg_cost: string }>(
    `select qty_on_hand,avg_cost from product_moving_cost where company_id=$1 and product_id=$2`, [co, P])
  return r.rows[0] ? { qty: Number(r.rows[0].qty_on_hand), avg: Number(r.rows[0].avg_cost) } : { qty: 0, avg: 0 }
}
async function nxtCloseQty(period: string, co: string): Promise<number> {
  const r = await db.query<Record<string, string>>(
    `select qty_close from kbit_inventory_nxt($1,null,$2) where product_id=$3`, [period, co, P])
  return r.rows[0] ? Number(r.rows[0].qty_close) : 0
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select '${FIXED_UID}'::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  for (const f of readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort())
    await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))
  userId = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'K','k@t.local','chief_accountant') returning id`, [FIXED_UID])
  coA = await val<string>(`insert into companies(code,name,country,base_currency) values ('COA','Cty A','VN','VND') returning id`)
  coB = await val<string>(`insert into companies(code,name,country,base_currency) values ('COB','Cty B','VN','VND') returning id`)
  whA  = await val<string>(`insert into warehouses(code,name,company_id) values ('K1','Kho A1',$1) returning id`, [coA])
  whA2 = await val<string>(`insert into warehouses(code,name,company_id) values ('K2','Kho A2',$1) returning id`, [coA])
  // Trùng code 'K1' nhưng khác công ty → unique (company_id, code) cho phép
  whB  = await val<string>(`insert into warehouses(code,name,company_id) values ('K1','Kho B1',$1) returning id`, [coB])
  P = await val<string>(`insert into products(code,name,unit) values ('SP','SP chung','cai') returning id`)
}, 180_000)

describe('Kho đa công ty — tách riêng từng công ty', () => {
  it('unique (company, code): 2 kho trùng code "K1" khác công ty — tạo được', async () => {
    const n = await val<string>(`select count(*)::text from warehouses where code='K1'`)
    expect(Number(n)).toBe(2)
  })
  it('cùng 1 mã: giá vốn BQ + tồn của 2 công ty TÁCH RIÊNG, không trộn', async () => {
    await receive(whA, 10, 100, '2026-10-01')   // Cty A: 10 @100
    await receive(whB, 10, 300, '2026-10-01')   // Cty B: 10 @300 (cùng mã, giá khác)
    expect(await mc(coA)).toEqual({ qty: 10, avg: 100 })
    expect(await mc(coB)).toEqual({ qty: 10, avg: 300 })   // KHÔNG trộn thành BQ chung
    await issue(whA, 4, '2026-10-05')                       // A xuất 4
    expect(await mc(coA)).toEqual({ qty: 6, avg: 100 })
    expect(await mc(coB)).toEqual({ qty: 10, avg: 300 })   // B KHÔNG đổi
  })
  it('NXT tách theo công ty: tồn cuối A = 6, B = 10 (độc lập)', async () => {
    expect(await nxtCloseQty('2026-10', coA)).toBe(6)
    expect(await nxtCloseQty('2026-10', coB)).toBe(10)
  })
  it('luân chuyển CHÉO công ty (A→B) bị CHẶN', async () => {
    await expect(transfer(whA, whB, 1, '2026-10-10')).rejects.toThrow(/LUAN_CHUYEN_KHAC_CTY|cùng công ty/)
  })
  it('luân chuyển trong CÙNG công ty (A1→A2) OK; tổng tồn A không đổi', async () => {
    await expect(transfer(whA, whA2, 2, '2026-10-12')).resolves.toBeDefined()
    expect((await mc(coA)).qty).toBe(6)   // luân chuyển nội bộ không đổi tổng
  })
  it('khóa kỳ công ty A chặn ghi kho A; công ty B KHÔNG bị chặn', async () => {
    await db.query(`insert into accounting_periods(company_id,period,status) values ($1,'2026-11','locked')`, [coA])
    await expect(receive(whA, 5, 100, '2026-11-02')).rejects.toThrow(/KY_DA_KHOA|đã khóa/)
    await expect(receive(whB, 5, 300, '2026-11-02')).resolves.toBeDefined()
  })
  it('khóa sổ 2 công ty cùng kỳ: 2 dòng snapshot riêng (unique company,product,period)', async () => {
    await db.query(`select kbit_close_inventory_cost('2026-10')`)   // null = mọi công ty
    const n = await val<string>(
      `select count(*)::text from inventory_cost_periods where product_id=$1 and period='2026-10'`, [P])
    expect(Number(n)).toBe(2)   // (coA, P, 2026-10) + (coB, P, 2026-10) — KHÔNG vỡ unique
    const a = await val<string>(`select qty_close::text from inventory_cost_periods where company_id=$1 and product_id=$2 and period='2026-10'`, [coA, P])
    const b = await val<string>(`select qty_close::text from inventory_cost_periods where company_id=$1 and product_id=$2 and period='2026-10'`, [coB, P])
    expect(Number(a)).toBe(6)
    expect(Number(b)).toBe(10)
  })
  it('C1: kỳ ĐÃ KHÓA — set_opening qty=0 KHÔNG được xóa lén số dư (phải bị chặn)', async () => {
    await db.query(`select kbit_set_opening_stock($1,$2,'2026-12',50,80)`, [P, whA])   // khai đầu kỳ 2026-12 (chưa khóa)
    await db.query(`insert into accounting_periods(company_id,period,status) values ($1,'2026-12','locked')`, [coA])  // khóa 2026-12 cty A
    // đường XÓA (qty=0) trong kỳ đã khóa phải bị chặn — trước đây lọt vì trigger không bắt DELETE
    await expect(db.query(`select kbit_set_opening_stock($1,$2,'2026-12',0,0)`, [P, whA])).rejects.toThrow(/KY_DA_KHOA|đã khóa/)
    const q = await val<string>(`select coalesce(sum(qty),0)::text from warehouse_transactions
      where product_id=$1 and warehouse_id=$2 and txn_type='opening' and txn_date='2026-12-01'`, [P, whA])
    expect(Number(q)).toBe(50)   // số dư đầu kỳ vẫn còn nguyên, không bị xóa lén
  })
})
