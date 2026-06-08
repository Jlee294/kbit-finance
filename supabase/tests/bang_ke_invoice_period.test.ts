// =====================================================================
// Contract test (A): Bảng kê bán ra / mua vào kê theo NGÀY HÓA ĐƠN.
// Quyết định nghiệp vụ (Anh Thịnh): lọc kỳ theo invoice_date; đơn CHƯA xuất
// hóa đơn (invoice_date NULL) thì ẨN khỏi bảng kê.
// Test khóa SEMANTIC của câu lọc mà listSalesInvoices/listPurchaseInvoices dùng
// (tầng queries.ts gọi Supabase không unit-test được offline — đây là regression
//  guard ở tầng SQL, đúng pattern supabase/tests của dự án).
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, companyId: string, custId: string, suppId: string

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params); return Object.values(r.rows[0])[0]
}

// Mô phỏng CHÍNH XÁC câu lọc bảng kê bán ra: theo invoice_date, loại NULL.
async function salesPeriod(from: string, to: string): Promise<string[]> {
  const r = await db.query<{ order_code: string }>(
    `select order_code from customer_orders
      where company_id=$1 and invoice_date is not null
        and invoice_date >= $2::date and invoice_date <= $3::date
      order by invoice_date desc`, [companyId, from, to])
  return r.rows.map(x => x.order_code)
}
async function purchasePeriod(from: string, to: string): Promise<string[]> {
  const r = await db.query<{ order_code: string }>(
    `select order_code from supplier_orders
      where company_id=$1 and invoice_date is not null
        and invoice_date >= $2::date and invoice_date <= $3::date
      order by invoice_date desc`, [companyId, from, to])
  return r.rows.map(x => x.order_code)
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
  companyId = await val<string>(`insert into companies(code,name,country,base_currency) values ('T','T','VN','VND') returning id`)
  custId = await val<string>(`insert into customers(code,name) values ('KH','KH') returning id`)
  suppId = await val<string>(`insert into suppliers(code,name,country) values ('NCC','NCC','VN') returning id`)

  // BÁN: đơn đặt 25/02 nhưng HĐ xuất 05/03 (khác tháng); + đơn chưa xuất HĐ
  await db.query(`insert into customer_orders(company_id,customer_id,order_code,order_date,invoice_no,invoice_date,grand_total)
    values ($1,$2,'BR-HĐ','2026-02-25','HD-1','2026-03-05',11000000)`, [companyId, custId])
  await db.query(`insert into customer_orders(company_id,customer_id,order_code,order_date,grand_total)
    values ($1,$2,'BR-CHƯA','2026-03-10',5000000)`, [companyId, custId])
  // MUA: tương tự
  await db.query(`insert into supplier_orders(company_id,supplier_id,order_code,order_date,invoice_no,invoice_date,goods_value)
    values ($1,$2,'MV-HĐ','2026-02-20','HDM-1','2026-03-08',8000000)`, [companyId, suppId])
  await db.query(`insert into supplier_orders(company_id,supplier_id,order_code,order_date,goods_value)
    values ($1,$2,'MV-CHƯA','2026-03-12',3000000)`, [companyId, suppId])
}, 180_000)

describe('A — Bảng kê kê theo ngày hóa đơn, ẩn đơn chưa xuất HĐ', () => {
  it('BÁN: HĐ ngày 05/03 vào kỳ THÁNG 3 (không vào tháng 2 dù đơn đặt 25/02)', async () => {
    expect(await salesPeriod('2026-03-01', '2026-03-31')).toEqual(['BR-HĐ'])
    expect(await salesPeriod('2026-02-01', '2026-02-28')).toEqual([])
  })
  it('BÁN: đơn chưa xuất HĐ (invoice_date NULL) bị ẩn khỏi mọi kỳ', async () => {
    expect(await salesPeriod('2026-01-01', '2026-12-31')).not.toContain('BR-CHƯA')
  })
  it('MUA: HĐ ngày 08/03 vào kỳ THÁNG 3 (không vào tháng 2 dù đơn 20/02)', async () => {
    expect(await purchasePeriod('2026-03-01', '2026-03-31')).toEqual(['MV-HĐ'])
    expect(await purchasePeriod('2026-02-01', '2026-02-28')).toEqual([])
  })
  it('MUA: đơn chưa xuất HĐ bị ẩn khỏi mọi kỳ', async () => {
    expect(await purchasePeriod('2026-01-01', '2026-12-31')).not.toContain('MV-CHƯA')
  })
})
