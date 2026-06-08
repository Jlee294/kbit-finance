// =====================================================================
// TEST LUỒNG E2E — Kho & Giá vốn (toàn trình)
//
// Mục tiêu (theo yêu cầu Anh Thịnh):
//  1) Nhập ĐẦY ĐỦ vào các "cửa nhập" qua đúng RPC mà app dùng
//     (số dư đầu kỳ, nhập kho, nhập khẩu, bán hàng, xuất khác, luân chuyển).
//  2) Dữ liệu TỰ chảy ra báo cáo — KHÔNG ghi tay vào bảng báo cáo:
//     bảng NXT (kbit_inventory_nxt), giá vốn đơn bán (cost_price tự gán),
//     khóa sổ (kbit_close_inventory_cost), lãi gộp (summarizeGrossProfit).
//  3) Đối chiếu TỔNG đầu–cuối; Σ theo kho = tổng mã; bất biến không chênh.
//  4) Test bộ LỌC: theo kho, theo kỳ (gối tồn tự nhiên từ sổ).
//
// Cơ chế: Postgres thật bằng PGlite, áp TOÀN BỘ migrations, gọi RPC.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarizeGrossProfit, type GrossRow } from '../../features/inventory-cost/avg-cost'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')

let db: PGlite
let userId: string, companyId: string, custId: string
let whVN: string, whKR: string
let A: string, B: string, C: string   // 3 mã hàng

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params)
  return Object.values(r.rows[0])[0]
}

// ── Cửa nhập (đúng RPC app dùng) ─────────────────────────────────────
const opening = (p: string, wh: string, period: string, qty: number, cost: number) =>
  db.query(`select kbit_set_opening_stock($1,$2,$3,$4,$5)`, [p, wh, period, qty, cost])
const receive = (wh: string, p: string, qty: number, cost: number, d: string, note: string) =>
  db.query(`select kbit_receive_stock($1,$2,$3,$4::date,$5,$6,$7)`, [wh, p, qty, d, note, userId, cost])
const issueReason = (wh: string, p: string, qty: number, reason: string, d: string) =>
  db.query(`select kbit_issue_stock($1,$2,$3,$4::issue_reason,$5::date,'xuat',$6)`, [wh, p, qty, reason, d, userId])
const transfer = (from: string, to: string, p: string, qty: number, d: string) =>
  db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,$5::date,'chuyen kho',$6)`, [from, to, p, qty, d, userId])

let orderSeq = 0
/** Bán hàng: tạo đơn + dòng hàng ĐẦY ĐỦ trường rồi trừ kho (cost_price TỰ gán). */
async function sell(p: string, wh: string, qty: number, unitPrice: number, d: string) {
  orderSeq += 1
  const orderId = await val<string>(
    `insert into customer_orders(company_id, customer_id, order_code, order_date, fulfillment_status)
     values ($1,$2,$3,$4::date,'delivered') returning id`,
    [companyId, custId, `SO-2610-${orderSeq}`, d],
  )
  await db.query(
    `insert into customer_order_items(order_id, product_id, description, qty, unit_price)
     values ($1,$2,$3,$4,$5)`,
    [orderId, p, 'ban hang', qty, unitPrice],
  )
  // Trừ kho theo đơn → cost_price tự gán = giá vốn BQ tại thời điểm bán
  await db.query(`select kbit_deduct_order_item($1,$2,$3,$4,$5,$6::date)`, [wh, p, qty, orderId, userId, d])
  return orderId
}

// ── Báo cáo (tự chảy ra) ─────────────────────────────────────────────
interface NxtRow {
  product_id: string; qty_open: number; value_open: number; qty_in: number; value_in: number
  qty_out: number; value_out: number; qty_close: number; value_close: number; avg_cost: number
}
async function nxt(period: string, wh: string | null): Promise<Map<string, NxtRow>> {
  const r = await db.query<Record<string, string>>(`select * from kbit_inventory_nxt($1,$2)`, [period, wh])
  const m = new Map<string, NxtRow>()
  for (const row of r.rows) {
    m.set(row.product_id as string, {
      product_id: row.product_id as string,
      qty_open: Number(row.qty_open), value_open: Number(row.value_open),
      qty_in: Number(row.qty_in), value_in: Number(row.value_in),
      qty_out: Number(row.qty_out), value_out: Number(row.value_out),
      qty_close: Number(row.qty_close), value_close: Number(row.value_close), avg_cost: Number(row.avg_cost),
    })
  }
  return m
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create or replace function auth.uid()  returns uuid  language sql stable as $$ select '${FIXED_UID}'::uuid $$;
    create or replace function auth.role() returns text  language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt()  returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `)
  for (const f of readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))

  userId = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'KTT','ktt@t.local','chief_accountant') returning id`, [FIXED_UID])
  companyId = await val<string>(`insert into companies(code,name,country,base_currency) values ('TSTCO','Test Co','VN','VND') returning id`)
  custId = await val<string>(`insert into customers(code,name) values ('KH01','KH Test') returning id`)
  whVN = await val<string>(`select id from warehouses where code='KHO-VN'`)
  whKR = await val<string>(`select id from warehouses where code='KHO-KR'`)
  A = await val<string>(`insert into products(code,name,unit) values ('SP-A','San pham A','cai') returning id`)
  B = await val<string>(`insert into products(code,name,unit) values ('SP-B','San pham B','cai') returning id`)
  C = await val<string>(`insert into products(code,name,unit) values ('SP-C','San pham C','cai') returning id`)

  // ===== KỊCH BẢN ĐẦU VÀO kỳ 2026-10 (gọi theo đúng thứ tự thời gian) =====
  // 1) Số dư đầu kỳ (01/10) — đủ trường: mã + kho + SL + đơn giá
  await opening(A, whVN, '2026-10', 100, 10000)   // A@VN 100 @10.000 = 1.000.000
  await opening(A, whKR, '2026-10', 50, 10000)    // A@KR  50 @10.000 =   500.000
  await opening(B, whVN, '2026-10', 20, 50000)    // B@VN  20 @50.000 = 1.000.000
  // 2) Nhập kho tay (05/10): A@VN 50 @16.000 → BQ A = (1.500.000+800.000)/200 = 11.500
  await receive(whVN, A, 50, 16000, '2026-10-05', 'nhap mua trong nuoc')
  // 3) Nhập khẩu (08/10) — mã mới C@VN 10 @200.000 (app: createImportOrder → kbit_receive_stock)
  await receive(whVN, C, 10, 200000, '2026-10-08', 'nhap khau')
  // 4) Bán hàng (10/10): A 30 @20.000; B 5 @80.000 (cost_price tự gán)
  await sell(A, whVN, 30, 20000, '2026-10-10')    // giá vốn tự = 11.500
  await sell(B, whVN, 5, 80000, '2026-10-10')     // giá vốn tự = 50.000
  // 5) Xuất khác (12/10): A@VN hỏng 5 (không phải bán → không vào lãi gộp)
  await issueReason(whVN, A, 5, 'damage', '2026-10-12')
  // 6) Luân chuyển (15/10): A VN→KR 20 (đổi kho, KHÔNG đổi BQ)
  await transfer(whVN, whKR, A, 20, '2026-10-15')
}, 180_000)

describe('E2E — Bảng NXT TỔNG mọi kho (tự chảy từ sổ)', () => {
  it('SP-A: đầu 150/1.5tr · nhập 50/800k · xuất 35/402.5k · cuối 165/1,897,500', async () => {
    const m = await nxt('2026-10', null)
    const a = m.get(A)!
    expect(a.qty_open).toBe(150);   expect(a.value_open).toBe(1_500_000)
    expect(a.qty_in).toBe(50);      expect(a.value_in).toBe(800_000)
    expect(a.qty_out).toBe(35);     expect(a.value_out).toBe(402_500)   // 35 × 11.500 (transfer KHÔNG tính)
    expect(a.qty_close).toBe(165);  expect(a.value_close).toBe(1_897_500)
    expect(a.avg_cost).toBe(11_500)
  })
  it('SP-B: đầu 20/1tr · xuất 5/250k · cuối 15/750k', async () => {
    const b = (await nxt('2026-10', null)).get(B)!
    expect(b.qty_open).toBe(20);  expect(b.value_open).toBe(1_000_000)
    expect(b.qty_out).toBe(5);    expect(b.value_out).toBe(250_000)
    expect(b.qty_close).toBe(15); expect(b.value_close).toBe(750_000)
  })
  it('SP-C (nhập khẩu): đầu 0 · nhập 10/2tr · cuối 10/2tr', async () => {
    const c = (await nxt('2026-10', null)).get(C)!
    expect(c.qty_open).toBe(0);   expect(c.qty_in).toBe(10); expect(c.value_in).toBe(2_000_000)
    expect(c.qty_close).toBe(10); expect(c.value_close).toBe(2_000_000)
  })
  it('BẤT BIẾN từng mã: Đầu + Nhập = Xuất + Cuối (sai số 0)', async () => {
    const m = await nxt('2026-10', null)
    for (const x of m.values())
      expect(x.value_open + x.value_in).toBeCloseTo(x.value_out + x.value_close, 2)
  })
})

describe('E2E — Lọc theo KHO + đối chiếu Σ kho = tổng mã', () => {
  it('SP-A tồn cuối: VN 95 + KR 70 = 165 (khớp tổng)', async () => {
    const vn = (await nxt('2026-10', whVN)).get(A)!
    const kr = (await nxt('2026-10', whKR)).get(A)!
    expect(vn.qty_close).toBe(95)   // 100+50−30−5−20(chuyển đi)
    expect(kr.qty_close).toBe(70)   // 50 + 20(chuyển đến)
    expect(vn.qty_close + kr.qty_close).toBe(165)
  })
  it('SP-A giá trị tồn cuối: VN + KR = 1,897,500 (tổng mã, dù từng kho khác đơn giá)', async () => {
    const vn = (await nxt('2026-10', whVN)).get(A)!
    const kr = (await nxt('2026-10', whKR)).get(A)!
    expect(vn.value_close + kr.value_close).toBeCloseTo(1_897_500, 2)
  })
  it('Lọc kho: luân chuyển vào Nhập/Xuất kho — VN xuất gồm chuyển đi, KR nhập gồm chuyển đến', async () => {
    const vn = (await nxt('2026-10', whVN)).get(A)!
    const kr = (await nxt('2026-10', whKR)).get(A)!
    expect(vn.qty_out).toBe(55)   // bán 30 + hỏng 5 + chuyển đi 20
    expect(kr.qty_in).toBe(20)    // chuyển đến 20
    // Tồn đầu cũng khớp: VN 100 + KR 50 = 150
    expect(vn.qty_open + kr.qty_open).toBe(150)
  })
  it('Kho KR chỉ có SP-A (B, C chưa từng vào KR) — đúng "chỉ mã có hoạt động/tồn"', async () => {
    const kr = await nxt('2026-10', whKR)
    expect(kr.has(A)).toBe(true)
    expect(kr.has(B)).toBe(false)
    expect(kr.has(C)).toBe(false)
  })
})

describe('E2E — Lãi gộp TỰ chảy (cost_price gán khi bán, không nhập tay)', () => {
  it('cost_price được hệ thống tự gán: A=11.500, B=50.000', async () => {
    const a = Number(await val(`select cost_price::text from customer_order_items where product_id=$1`, [A]))
    const b = Number(await val(`select cost_price::text from customer_order_items where product_id=$1`, [B]))
    expect(a).toBe(11_500)
    expect(b).toBe(50_000)
  })
  it('Lãi gộp kỳ: DT 1.000.000 − GV 595.000 = Lãi 405.000', async () => {
    // mô phỏng đúng query app (grossProfit): đọc dòng bán đã có cost_price, gộp bằng summarizeGrossProfit
    const r = await db.query<Record<string, string>>(
      `select coi.product_id, coi.qty, coi.unit_price, coi.cost_price, p.code pcode, p.name pname, co.order_code
       from customer_order_items coi
       join customer_orders co on co.id = coi.order_id
       join products p on p.id = coi.product_id
       where to_char(co.order_date,'YYYY-MM')='2026-10' and coi.cost_price is not null`)
    const rows: GrossRow[] = r.rows.map((x) => ({
      product_id: x.product_id as string, qty: Number(x.qty), unit_price: Number(x.unit_price),
      cost_price: x.cost_price != null ? Number(x.cost_price) : null,
      product_code: x.pcode as string, product_name: x.pname as string, order_code: x.order_code as string,
    }))
    const g = summarizeGrossProfit(rows)
    expect(g.total.revenue).toBe(1_000_000)   // 30×20.000 + 5×80.000
    expect(g.total.cogs).toBe(595_000)        // 30×11.500 + 5×50.000
    expect(g.total.profit).toBe(405_000)
  })
})

describe('E2E — Khóa sổ snapshot KHỚP bảng NXT live', () => {
  it('kbit_close 2026-10 → inventory_cost_periods = NXT live (SP-A)', async () => {
    await db.query(`select kbit_close_inventory_cost('2026-10')`)
    const snap = await db.query<Record<string, string>>(
      `select qty_open,value_open,qty_in,value_in,qty_out,value_out,qty_close,value_close
       from inventory_cost_periods where product_id=$1 and period='2026-10'`, [A])
    const s = snap.rows[0]
    const live = (await nxt('2026-10', null)).get(A)!
    expect(Number(s.qty_open)).toBe(live.qty_open)
    expect(Number(s.value_open)).toBe(live.value_open)
    expect(Number(s.qty_in)).toBe(live.qty_in)
    expect(Number(s.value_in)).toBe(live.value_in)
    expect(Number(s.qty_out)).toBe(live.qty_out)
    expect(Number(s.value_out)).toBe(live.value_out)
    expect(Number(s.qty_close)).toBe(live.qty_close)
    expect(Number(s.value_close)).toBe(live.value_close)
  })
})

describe('E2E — Lọc theo KỲ (tồn cuối kỳ này = tồn đầu kỳ sau, tự gối từ sổ)', () => {
  it('NXT 2026-11 tồn đầu = NXT 2026-10 tồn cuối (mọi mã)', async () => {
    const oct = await nxt('2026-10', null)
    const nov = await nxt('2026-11', null)
    for (const [pid, o] of oct) {
      const n = nov.get(pid)!
      expect(n.qty_open).toBe(o.qty_close)
      expect(n.value_open).toBeCloseTo(o.value_close, 2)
    }
  })
})
