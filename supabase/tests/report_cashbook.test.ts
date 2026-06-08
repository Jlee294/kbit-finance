// =====================================================================
// Đợt 2 (B+E): Báo cáo dòng tiền + công nợ phải TÍNH "Chứng từ khác" (cash_book).
//  E — cash_book thu → total_income; chi → total_expense (chỉ confirmed; chỉ khi
//      KHÔNG lọc theo dự án vì cash_book không gắn dự án).
//  B — cash_book gắn KH/NCC điều chỉnh ar/ap_outstanding để KHỚP trang Công nợ
//      (AR: thu giảm, chi tăng; AP: chi giảm, thu tăng) — đúng cashEntryToLedgerSource.
// Test gọi RPC kbit_report_company / kbit_report_consolidated TRỰC TIẾP trên Postgres thật.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params); return Object.values(r.rows[0])[0]
}
async function seedCo(code: string) {
  const co = await val<string>(`insert into companies(code,name,country,base_currency) values ($1,$1,'VN','VND') returning id`, [code])
  const kh = await val<string>(`insert into customers(code,name) values ($1,$1) returning id`, [`KH-${code}`])
  const ncc = await val<string>(`insert into suppliers(code,name,country) values ($1,$1,'VN') returning id`, [`NCC-${code}`])
  const ba = await val<string>(`insert into bank_accounts(company_id,name,currency) values ($1,'TK','VND') returning id`, [co])
  return { co, kh, ncc, ba }
}
const cash = (co: string, dir: 'thu'|'chi', amt: number, d: string, opts: {cust?: string, supp?: string, status?: string} = {}) =>
  db.query(`insert into cash_book(company_id,txn_date,noi_dung,so_tien,direction,status,customer_id,supplier_id)
            values ($1,$2::date,'ctk',$3,$4,$5,$6,$7)`,
    [co, d, amt, dir, opts.status ?? 'confirmed', opts.cust ?? null, opts.supp ?? null])
const income = (co: string, ba: string, kh: string, amt: number, d: string) =>
  db.query(`insert into income_transactions(company_id,bank_account_id,customer_id,amount,txn_date,status,currency,amount_vnd)
            values ($1,$2,$3,$4,$5::date,'confirmed','VND',$4)`, [co, ba, kh, amt, d])
async function repCo(co: string, project: string | null, from: string | null, to: string | null) {
  const r = await db.query<Record<string, string>>(
    `select * from kbit_report_company($1::uuid,$2::uuid,$3::date,$4::date)`, [co, project, from, to])
  const x = r.rows[0]
  return { income: Number(x.total_income), expense: Number(x.total_expense), net: Number(x.net_cash_flow),
           ar: Number(x.ar_outstanding), ap: Number(x.ap_outstanding) }
}
async function repCons(from: string | null, to: string | null) {
  const r = await db.query<Record<string, string>>(`select * from kbit_report_consolidated($1::date,$2::date)`, [from, to])
  const x = r.rows[0]
  return { income: Number(x.total_income_vnd), expense: Number(x.total_expense_vnd),
           ar: Number(x.ar_outstanding_vnd), ap: Number(x.ap_outstanding_vnd) }
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
}, 180_000)

describe('E — cash_book vào báo cáo dòng tiền (kbit_report_company)', () => {
  it('thu → total_income, chi → total_expense; cộng thêm phiếu thu NH; bỏ qua draft', async () => {
    const { co, kh, ba } = await seedCo('E1')
    await income(co, ba, kh, 3_000_000, '2026-04-10')          // tiền NH 3tr
    await cash(co, 'thu', 5_000_000, '2026-04-12', { cust: kh })// tiền mặt thu 5tr
    await cash(co, 'chi', 2_000_000, '2026-04-15')             // tiền mặt chi 2tr
    await cash(co, 'thu', 9_000_000, '2026-04-20', { status: 'draft' }) // draft → KHÔNG tính
    const r = await repCo(co, null, '2026-04-01', '2026-04-30')
    expect(r.income).toBe(8_000_000)   // 3tr NH + 5tr mặt
    expect(r.expense).toBe(2_000_000)
    expect(r.net).toBe(6_000_000)
  })

  it('lọc theo DỰ ÁN → cash_book KHÔNG tính (cash_book không gắn dự án)', async () => {
    const { co, ba, kh } = await seedCo('E2')
    const proj = await val<string>(`insert into projects(company_id,code,name) values ($1,'P','P') returning id`, [co])
    await db.query(`insert into income_transactions(company_id,bank_account_id,customer_id,amount,txn_date,status,currency,amount_vnd,project_id)
                    values ($1,$2,$3,3000000,'2026-04-10','confirmed','VND',3000000,$4)`, [co, ba, kh, proj])
    await cash(co, 'thu', 5_000_000, '2026-04-12')             // không gắn dự án
    const withProj = await repCo(co, proj, '2026-04-01', '2026-04-30')
    const allCo    = await repCo(co, null, '2026-04-01', '2026-04-30')
    expect(withProj.income).toBe(3_000_000)   // chỉ tiền NH theo dự án — KHÔNG có cash mặt
    expect(allCo.income).toBe(8_000_000)      // toàn công ty → có cash mặt
  })
})

describe('B — công nợ báo cáo khớp trang Công nợ (cash_book gắn KH/NCC)', () => {
  it('AR: đơn 10tr + Chứng từ khác THU 4tr gắn KH → phải thu = 6tr (khớp ledger)', async () => {
    const { co, kh } = await seedCo('B1')
    await db.query(`insert into customer_orders(company_id,customer_id,order_code,order_date,grand_total,fulfillment_status)
                    values ($1,$2,'O','2026-05-02',10000000,'confirmed')`, [co, kh])
    await cash(co, 'thu', 4_000_000, '2026-05-20', { cust: kh })
    await cash(co, 'thu', 1_000_000, '2026-05-25', { cust: kh, status: 'draft' }) // draft bỏ qua
    const r = await repCo(co, null, null, '2026-12-31')
    expect(r.ar).toBe(6_000_000)
  })

  it('AP: đơn NCC 8tr + Chứng từ khác CHI 3tr gắn NCC → phải trả = 5tr', async () => {
    const { co, ncc } = await seedCo('B2')
    await db.query(`insert into supplier_orders(company_id,supplier_id,order_code,order_date,goods_value)
                    values ($1,$2,'SO','2026-05-01',8000000)`, [co, ncc])
    await cash(co, 'chi', 3_000_000, '2026-05-10', { supp: ncc })
    const r = await repCo(co, null, null, '2026-12-31')
    expect(r.ap).toBe(5_000_000)
  })

  it('AR: Chứng từ khác CHI gắn KH → TĂNG phải thu (đơn 10tr + chi 2tr = 12tr)', async () => {
    const { co, kh } = await seedCo('B3')
    await db.query(`insert into customer_orders(company_id,customer_id,order_code,order_date,grand_total,fulfillment_status)
                    values ($1,$2,'O3','2026-05-02',10000000,'confirmed')`, [co, kh])
    await cash(co, 'chi', 2_000_000, '2026-05-20', { cust: kh })
    const r = await repCo(co, null, null, '2026-12-31')
    expect(r.ar).toBe(12_000_000)
  })
})

describe('Báo cáo HỢP NHẤT (kbit_report_consolidated) cũng tính cash_book', () => {
  it('delta: thêm cash thu 7tr (tự do) + đơn 10tr + cash thu 4tr (gắn KH) → income +11tr, ar +6tr', async () => {
    const before = await repCons(null, null)
    const { co, kh } = await seedCo('CONS')
    await cash(co, 'thu', 7_000_000, '2026-06-01')                 // thu tự do
    await db.query(`insert into customer_orders(company_id,customer_id,order_code,order_date,grand_total,fulfillment_status)
                    values ($1,$2,'OC','2026-06-02',10000000,'confirmed')`, [co, kh])
    await cash(co, 'thu', 4_000_000, '2026-06-03', { cust: kh })   // thu gắn KH
    const after = await repCons(null, null)
    expect(after.income - before.income).toBe(11_000_000)         // 7 + 4
    expect(after.ar - before.ar).toBe(6_000_000)                  // 10 − 4
  })

  it('FX: cash_book công ty KR phải QUY ĐỔI KRW→VND theo tỷ giá (không cộng raw)', async () => {
    await db.query(`insert into exchange_rates(currency_from,currency_to,rate,rate_date) values ('KRW','VND',18,'2026-01-01')`)
    const before = await repCons(null, null)
    const coKr = await val<string>(`insert into companies(code,name,country,base_currency) values ('KR1','KR1','KR','KRW') returning id`)
    const khKr = await val<string>(`insert into customers(code,name) values ('KH-KR1','KH-KR1') returning id`)
    await cash(coKr, 'thu', 1_000_000, '2026-06-10')                      // 1tr KRW thu tự do
    await cash(coKr, 'thu',   500_000, '2026-06-11', { cust: khKr })      // 0.5tr KRW thu gắn KH
    const after = await repCons(null, null)
    expect(after.income - before.income).toBe(27_000_000)   // (1tr + 0.5tr) KRW × 18
    expect(after.ar - before.ar).toBe(-9_000_000)           // thu gắn KH 0.5tr KRW × 18 = giảm 9tr phải thu
  })
})
