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
const adjust = (wh: string, p: string, delta: number, cost: number | null = null) =>
  db.query(`select kbit_adjust_stock($1,$2,$3,$4)`, [wh, p, delta, cost])

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
  it('BLOCKER2 — khóa sổ CÙNG kỳ có số dư đầu kỳ: tồn đầu = số đã khai, tồn cuối đúng', async () => {
    const p = await freshProduct()
    await opening(p, whVN, '2026-08', 100, 50)      // số dư đầu kỳ 2026-08: 100 @50 = 5000
    await issue(whVN, p, 40, '2026-08-15')          // xuất 40 @50 = 2000
    await db.query(`select kbit_close_inventory_cost('2026-08')`)
    const r = (await db.query<Record<string, string>>(
      `select qty_open,value_open,qty_out,value_out,qty_close,value_close
       from inventory_cost_periods where product_id=$1 and period='2026-08'`, [p])).rows[0]
    expect(Number(r.qty_open)).toBe(100)            // KHÔNG bị bỏ sót opening
    expect(Number(r.value_open)).toBe(5000)
    expect(Number(r.qty_out)).toBe(40)
    expect(Number(r.value_out)).toBe(2000)
    expect(Number(r.qty_close)).toBe(60)
    expect(Number(r.value_close)).toBe(3000)
    expect(Number(r.value_open)).toBeCloseTo(Number(r.value_out) + Number(r.value_close), 2)
  })
  it('BLOCKER1 — adjust(+qty, giá) cập nhật BQ → bán ra có giá vốn (không = 0)', async () => {
    const p = await freshProduct()
    await adjust(whVN, p, 100, 80)                  // nhập kiểu nhập khẩu: +100 @80
    expect(await mc(p)).toEqual({ qty: 100, avg: 80 })
    await issue(whVN, p, 10)
    expect(await lastUnitCost(p, 'issue')).toBe(80) // giá vốn xuất = 80, KHÔNG phải 0
  })
  it('adjust giảm tồn giữ avg; adjust tăng không giá → giữ avg hiện hành', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100)                 // avg 100
    await adjust(whVN, p, -3)                        // giảm 3, avg giữ 100
    expect(await mc(p)).toEqual({ qty: 7, avg: 100 })
    await adjust(whVN, p, 5, null)                   // tăng 5 không giá → avg giữ 100
    expect(await mc(p)).toEqual({ qty: 12, avg: 100 })
  })
  it('đa kho khác giá cùng mã: BQ blend theo tổng mã', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 100)                 // kho VN: 10 @100
    await receive(whKR, p, 10, 200)                 // kho KR: 10 @200 → avg (1000+2000)/20 = 150
    expect(await mc(p)).toEqual({ qty: 20, avg: 150 })
    expect(await stockQty(whVN, p)).toBe(10)
    expect(await stockQty(whKR, p)).toBe(10)
  })
})
