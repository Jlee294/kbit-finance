// =====================================================================
// Test VÁ điều chỉnh kho (adjustment) — báo cáo NXT/khóa sổ phải tính adjustment.
// Bug (ghi nợ G2 §7.1): dòng sổ 'adjustment' (sinh khi SỬA đơn bán đã trừ kho)
// không có dấu → NXT bỏ qua → Tồn cuối báo cáo LỆCH tồn thực.
// Vá: adjustment mang DẤU (qty +/−); kbit_adjust_stock tự ghi sổ + unit_cost;
//     kbit_inventory_nxt & kbit_close tính adjustment (+ = nhập, − = xuất).
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, whVN: string, userId: string, companyId: string, custId: string

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params); return Object.values(r.rows[0])[0]
}
let seq = 0
async function freshProduct(): Promise<string> {
  seq += 1; return val<string>(`insert into products(code,name,unit) values ($1,$2,'cai') returning id`, [`ADJ-${seq}`, `SP ${seq}`])
}
const receive = (wh: string, p: string, n: number, c: number, d: string) =>
  db.query(`select kbit_receive_stock($1,$2,$3,$4::date,'r',$5,$6)`, [wh, p, n, d, userId, c])
// adjust theo chữ ký MỚI (0032): (wh, product, delta, unit_cost, txn_date)
const adjust = (wh: string, p: string, delta: number, d: string, cost: number | null = null) =>
  db.query(`select kbit_adjust_stock($1,$2,$3,$4,$5::date)`, [wh, p, delta, cost, d])
async function sell(p: string, wh: string, n: number, price: number, d: string) {
  seq += 1
  const oid = await val<string>(
    `insert into customer_orders(company_id,customer_id,order_code,order_date) values ($1,$2,$3,$4::date) returning id`,
    [companyId, custId, `SO-ADJ-${seq}`, d])
  await db.query(`insert into customer_order_items(order_id,product_id,qty,unit_price) values ($1,$2,$3,$4)`, [oid, p, n, price])
  await db.query(`select kbit_deduct_order_item($1,$2,$3,$4,$5,$6::date)`, [wh, p, n, oid, userId, d])
  return oid
}
async function stockQty(wh: string, p: string): Promise<number> {
  return Number(await val(`select coalesce((select qty_on_hand from warehouse_stock where warehouse_id=$1 and product_id=$2),0)::text`, [wh, p]))
}
async function nxtRow(period: string, wh: string | null, p: string) {
  const r = await db.query<Record<string, string>>(`select * from kbit_inventory_nxt($1,$2) where product_id=$3`, [period, wh, p])
  const x = r.rows[0]
  return x ? {
    qty_open: Number(x.qty_open), value_open: Number(x.value_open), qty_in: Number(x.qty_in), value_in: Number(x.value_in),
    qty_out: Number(x.qty_out), value_out: Number(x.value_out), qty_close: Number(x.qty_close), value_close: Number(x.value_close),
  } : null
}
async function lastAdj(p: string) {
  const r = await db.query<{ qty: string; unit_cost: string }>(
    `select qty::text, unit_cost::text from warehouse_transactions where product_id=$1 and txn_type='adjustment' order by created_at desc, id desc limit 1`, [p])
  return r.rows[0] ? { qty: Number(r.rows[0].qty), unit_cost: Number(r.rows[0].unit_cost) } : null
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
  companyId = await val<string>(`insert into companies(code,name,country,base_currency) values ('T','T','VN','VND') returning id`)
  custId = await val<string>(`insert into customers(code,name) values ('KH','KH') returning id`)
  whVN = await val<string>(`select id from warehouses where code='KHO-VN'`)
}, 180_000)

describe('Vá adjustment — vào báo cáo NXT, khớp tồn thực', () => {
  it('adjust TĂNG: ghi sổ qty DƯƠNG + unit_cost=avg; NXT tính vào Nhập; tồn cuối = tồn thực', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 100, '2026-10-01')   // tồn 100, avg 100
    await adjust(whVN, p, 30, '2026-10-05')           // +30 hoàn kho (avg hiện hành 100)
    expect(await lastAdj(p)).toEqual({ qty: 30, unit_cost: 100 })
    expect(await stockQty(whVN, p)).toBe(130)
    const n = (await nxtRow('2026-10', null, p))!
    expect(n.qty_in).toBe(130)        // receipt 100 + adjust +30
    expect(n.qty_out).toBe(0)
    expect(n.qty_close).toBe(130)     // KHỚP tồn thực
    expect(n.value_close).toBe(13000)
  })
  it('adjust GIẢM: ghi sổ qty ÂM; NXT tính vào Xuất; tồn cuối = tồn thực', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 100, '2026-10-01')
    await adjust(whVN, p, -40, '2026-10-05')          // −40
    expect(await lastAdj(p)).toEqual({ qty: -40, unit_cost: 100 })
    expect(await stockQty(whVN, p)).toBe(60)
    const n = (await nxtRow('2026-10', null, p))!
    expect(n.qty_in).toBe(100)
    expect(n.qty_out).toBe(40)        // adjust − vào Xuất (giá trị tuyệt đối)
    expect(n.value_out).toBe(4000)
    expect(n.qty_close).toBe(60)      // KHỚP tồn thực
  })
  it('SỬA ĐƠN (kịch bản gốc gây lỗi): bán 30 rồi hoàn 20 → NXT tồn cuối = tồn thực kho', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 100, '2026-10-01')
    await sell(p, whVN, 30, 200, '2026-10-10')        // tồn 70
    await adjust(whVN, p, 20, '2026-10-12')           // sửa đơn: hoàn 20 → tồn 90
    const stock = await stockQty(whVN, p)
    expect(stock).toBe(90)
    const n = (await nxtRow('2026-10', null, p))!
    expect(n.qty_close).toBe(stock)   // TRƯỚC vá = 70 (sai); SAU vá = 90 = tồn thực
    expect(n.qty_in).toBe(120)        // receipt 100 + hoàn 20
    expect(n.qty_out).toBe(30)        // bán 30
  })
  it('khóa sổ TÍNH adjustment: snapshot tồn cuối = NXT (khớp)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 100, '2026-10-01')
    await adjust(whVN, p, -25, '2026-10-08')
    await db.query(`select kbit_close_inventory_cost('2026-10')`)
    const s = (await db.query<Record<string, string>>(
      `select qty_close,value_close,qty_out from inventory_cost_periods where product_id=$1 and period='2026-10'`, [p])).rows[0]
    const n = (await nxtRow('2026-10', null, p))!
    expect(Number(s.qty_close)).toBe(75)
    expect(Number(s.qty_close)).toBe(n.qty_close)
    expect(Number(s.qty_out)).toBe(25)   // adjustment − vào xuất khi khóa sổ
  })
  it('bất biến vẫn đúng sau adjustment: Đầu + Nhập = Xuất + Cuối', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 50, 200, '2026-10-02')
    await adjust(whVN, p, 10, '2026-10-04')
    await adjust(whVN, p, -15, '2026-10-09')
    const n = (await nxtRow('2026-10', null, p))!
    expect(n.value_open + n.value_in).toBeCloseTo(n.value_out + n.value_close, 2)
  })
})
