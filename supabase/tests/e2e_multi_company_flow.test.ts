// =====================================================================
// TEST LUỒNG VẬN HÀNH ĐA CÔNG TY (end-to-end, số liệu tự cho).
// Triết lý: chỉ BƠM dữ liệu ĐẦU VÀO (đầu kỳ / nhập / bán / xuất / luân chuyển /
//   điều chỉnh) qua RPC. KHÔNG ghi tay vào báo cáo. Sau đó để bảng NXT + khóa sổ
//   TỰ suy ra từ sổ cái, rồi đối chiếu: tách riêng 2 công ty, bất biến giá trị,
//   khớp tồn thực, snapshot khóa sổ = NXT live, giá vốn xuất = bình quân hiện hành.
//
//   2 công ty A, B dùng CHUNG 1 mã P. Công ty A có 2 kho (A1, A2) để test luân
//   chuyển nội bộ. Đơn giá nhập khác nhau → giá vốn BQ 2 công ty phải KHÁC nhau.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (s: string) => s.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, coA: string, coB: string, whA1: string, whA2: string, whB: string, userId: string, P: string

async function val<T = string>(sql: string, p: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, p); return Object.values(r.rows[0])[0]
}
const receive = (wh: string, n: number, c: number, d: string) =>
  db.query(`select kbit_receive_stock($1,$2,$3,$4::date,'nhập',$5,$6)`, [wh, P, n, d, userId, c])
const issue = (wh: string, n: number, d: string) =>
  db.query(`select kbit_issue_stock($1,$2,$3,'damage'::issue_reason,$4::date,'hủy',$5)`, [wh, P, n, d, userId])
const transfer = (a: string, b: string, n: number, d: string) =>
  db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,$5::date,'lc',$6)`, [a, b, P, n, d, userId])
const deduct = (wh: string, n: number, oid: string | null, d: string) =>
  db.query(`select kbit_deduct_order_item($1,$2,$3,$4,$5,$6::date)`, [wh, P, n, oid, userId, d])
const adjust = (wh: string, delta: number, c: number, d: string) =>
  db.query(`select kbit_adjust_stock($1,$2,$3,$4,$5::date,'điều chỉnh',$6)`, [wh, P, delta, c, d, userId])
const opening = (wh: string, period: string, n: number, c: number) =>
  db.query(`select kbit_set_opening_stock($1,$2,$3,$4,$5)`, [P, wh, period, n, c])

interface Nxt { qty_open: number; value_open: number; qty_in: number; value_in: number; qty_out: number; value_out: number; qty_close: number; value_close: number; avg_cost: number }
async function nxt(period: string, company: string, wh: string | null = null): Promise<Nxt | null> {
  const r = await db.query<Record<string, string>>(
    `select qty_open,value_open,qty_in,value_in,qty_out,value_out,qty_close,value_close,avg_cost
     from kbit_inventory_nxt($1,$2,$3) where product_id=$4`, [period, wh, company, P])
  if (!r.rows[0]) return null
  return Object.fromEntries(Object.entries(r.rows[0]).map(([k, v]) => [k, Number(v)])) as unknown as Nxt
}
async function mc(co: string): Promise<{ qty: number; avg: number }> {
  const r = await db.query<{ qty_on_hand: string; avg_cost: string }>(
    `select qty_on_hand,avg_cost from product_moving_cost where company_id=$1 and product_id=$2`, [co, P])
  return r.rows[0] ? { qty: Number(r.rows[0].qty_on_hand), avg: Number(r.rows[0].avg_cost) } : { qty: 0, avg: 0 }
}
async function stockSum(company: string): Promise<number> {
  return Number(await val<string>(
    `select coalesce(sum(ws.qty_on_hand),0)::text from warehouse_stock ws
     join warehouses w on w.id = ws.warehouse_id where w.company_id=$1 and ws.product_id=$2`, [company, P]))
}

const PER = '2026-03'

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select '${FIXED_UID}'::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  for (const f of readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort())
    await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))
  userId = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'K','k@t.local','chief_accountant') returning id`, [FIXED_UID])
  coA = await val<string>(`insert into companies(code,name,country,base_currency) values ('MCA','Cty A','VN','VND') returning id`)
  coB = await val<string>(`insert into companies(code,name,country,base_currency) values ('MCB','Cty B','VN','VND') returning id`)
  whA1 = await val<string>(`insert into warehouses(code,name,company_id) values ('A1','Kho A1',$1) returning id`, [coA])
  whA2 = await val<string>(`insert into warehouses(code,name,company_id) values ('A2','Kho A2',$1) returning id`, [coA])
  whB  = await val<string>(`insert into warehouses(code,name,company_id) values ('B1','Kho B1',$1) returning id`, [coB])
  P = await val<string>(`insert into products(code,name,unit) values ('SP','SP chung','cai') returning id`)

  // ── LUỒNG ĐẦU VÀO — chỉ bơm phát sinh, báo cáo sẽ tự suy ──────────────────────
  // Công ty A (kho A1 + A2)
  await opening(whA1, PER, 100, 50)        // tồn đầu A: 100 @50  (value 5000)
  await receive(whA1, 100, 70, `${PER}-05`) // nhập 100 @70  → BQ A = (5000+7000)/200 = 60
  await deduct(whA1, 80, null, `${PER}-10`) // bán 80 (đơn) → giá vốn xuất = 60
  await transfer(whA1, whA2, 30, `${PER}-12`)  // luân chuyển nội bộ A1→A2 30 (tổng A không đổi)
  await adjust(whA1, 10, 60, `${PER}-15`)      // điều chỉnh tăng 10 @60 (kiểm adjustment vào nhập)
  // Công ty B (kho B1) — đơn giá khác hẳn để chắc KHÔNG trộn
  await opening(whB, PER, 200, 30)         // tồn đầu B: 200 @30  (value 6000)
  await receive(whB, 50, 42, `${PER}-05`)  // nhập 50 @42  → BQ B = (6000+2100)/250 = 32.4
  await issue(whB, 20, `${PER}-10`)        // xuất hủy 20 → giá vốn xuất = 32.4
}, 180_000)

describe('Luồng vận hành đa công ty — số liệu tự chảy qua báo cáo', () => {
  it('giá vốn BQ 2 công ty TÁCH RIÊNG (cùng mã, không trộn)', async () => {
    expect(await mc(coA)).toEqual({ qty: 130, avg: 60 })        // A: 100+100−80+10 = 130 @60
    expect(await mc(coB)).toEqual({ qty: 230, avg: 32.4 })      // B: 200+50−20 = 230 @32.4
  })

  it('TỒN THỰC (warehouse_stock) khớp giá vốn cache — từng công ty', async () => {
    expect(await stockSum(coA)).toBe(130)   // A1 (100+100−80−30+10=100) + A2 (30) = 130
    expect(await stockSum(coB)).toBe(230)
    expect(Number(await val<string>(`select qty_on_hand::text from warehouse_stock where warehouse_id=$1 and product_id=$2`, [whA1, P]))).toBe(100)
    expect(Number(await val<string>(`select qty_on_hand::text from warehouse_stock where warehouse_id=$1 and product_id=$2`, [whA2, P]))).toBe(30)
  })

  it('NXT công ty A tự suy đúng + BẤT BIẾN value_open+value_in = value_out+value_close', async () => {
    const a = (await nxt(PER, coA))!
    expect(a.qty_open).toBe(100);  expect(a.value_open).toBe(5000)
    expect(a.qty_in).toBe(110);    expect(a.value_in).toBe(7600)   // nhập 100@70 + điều chỉnh 10@60
    expect(a.qty_out).toBe(80);    expect(a.value_out).toBe(4800)  // bán 80@60 (luân chuyển nội bộ KHÔNG tính ở mức công ty)
    expect(a.qty_close).toBe(130); expect(a.value_close).toBe(7800)
    expect(a.avg_cost).toBeCloseTo(60, 6)
    expect(a.value_open + a.value_in).toBeCloseTo(a.value_out + a.value_close, 6)
  })

  it('NXT công ty B tự suy đúng + bất biến (độc lập hoàn toàn với A)', async () => {
    const b = (await nxt(PER, coB))!
    expect(b.qty_open).toBe(200);  expect(b.value_open).toBe(6000)
    expect(b.qty_in).toBe(50);     expect(b.value_in).toBe(2100)
    expect(b.qty_out).toBe(20);    expect(b.value_out).toBeCloseTo(648, 6)   // 20 @32.4
    expect(b.qty_close).toBe(230); expect(b.value_close).toBeCloseTo(7452, 6)
    expect(b.avg_cost).toBeCloseTo(32.4, 6)
    expect(b.value_open + b.value_in).toBeCloseTo(b.value_out + b.value_close, 6)
  })

  it('lọc NXT theo TỪNG KHO của công ty A: A1=100, A2=30 (luân chuyển hiện ra ở mức kho)', async () => {
    const a1 = (await nxt(PER, coA, whA1))!
    expect(a1.qty_open).toBe(100)
    expect(a1.qty_in).toBe(110)                 // nhập 100 + điều chỉnh 10
    expect(a1.qty_out).toBe(110)                // bán 80 + luân chuyển ra 30
    expect(a1.qty_close).toBe(100)
    const a2 = (await nxt(PER, coA, whA2))!
    expect(a2.qty_in).toBe(30)                  // luân chuyển vào 30
    expect(a2.qty_close).toBe(30)
    expect(a1.qty_close + a2.qty_close).toBe(130)   // tổng 2 kho = tồn công ty A
  })

  it('giá vốn xuất theo ĐƠN BÁN = bình quân hiện hành (chảy vào sổ + ghi cost_price)', async () => {
    // dòng order_deduction của A phải mang unit_cost = 60
    const uc = await val<string>(
      `select unit_cost::text from warehouse_transactions
       where company_id=$1 and product_id=$2 and txn_type='order_deduction'`, [coA, P])
    expect(Number(uc)).toBe(60)
  })

  it('KHÓA SỔ: snapshot mỗi công ty = NXT live (đối chiếu chéo) + tách 2 dòng', async () => {
    await db.query(`select kbit_close_inventory_cost($1)`, [PER])   // null company = khóa mọi công ty
    const n = await val<string>(`select count(*)::text from inventory_cost_periods where product_id=$1 and period=$2`, [P, PER])
    expect(Number(n)).toBe(2)   // (A,P,kỳ) + (B,P,kỳ) riêng

    for (const co of [coA, coB]) {
      const live = (await nxt(PER, co))!
      const snap = await db.query<{ qty_close: string; value_close: string; avg_unit_cost: string }>(
        `select qty_close, value_close, avg_unit_cost from inventory_cost_periods where company_id=$1 and product_id=$2 and period=$3`, [co, P, PER])
      expect(Number(snap.rows[0].qty_close)).toBe(live.qty_close)
      expect(Number(snap.rows[0].value_close)).toBeCloseTo(live.value_close, 6)
      expect(Number(snap.rows[0].avg_unit_cost)).toBeCloseTo(live.avg_cost, 6)
    }
  })

  it('tháng sau khóa A: ghi kho A bị chặn; công ty B vẫn ghi được (khóa kỳ theo công ty)', async () => {
    await db.query(`insert into accounting_periods(company_id,period,status) values ($1,$2,'locked')`, [coA, '2026-04'])
    await expect(receive(whA1, 5, 70, '2026-04-02')).rejects.toThrow(/KY_DA_KHOA|đã khóa/)
    await expect(receive(whB, 5, 40, '2026-04-02')).resolves.toBeDefined()
  })
})
