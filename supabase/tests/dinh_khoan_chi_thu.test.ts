// =====================================================================
// Test định khoản tay (Nợ/Có) cho phiếu THU & CHI.
// Yêu cầu: 5 RPC ghi thu/chi phải nhận p_dinh_khoan_no / p_dinh_khoan_co
// và lưu đúng vào expense_transactions / income_transactions.
//   kbit_create_expense_vn, kbit_create_expense_kr,
//   kbit_pay_vn_supplier,   kbit_pay_kr_supplier,   kbit_record_income
//
// Cơ chế giống warehouse_stock_negative_check.test.ts: dựng Postgres thật
// bằng PGlite, áp TOÀN BỘ migrations (gồm 0026), seed dữ liệu, gọi RPC.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'

// gen_random_uuid() là core PG13+ → PGlite không cần extension pgcrypto.
function patch(sql: string): string {
  return sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- [test] pgcrypto skipped')
}

let db: PGlite
let companyId: string
let bankVnd: string
let bankKrw: string
let custId: string
let soVnd: string
let soKrw: string

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params)
  return Object.values(r.rows[0])[0]
}

// Đọc lại cặp định khoản đã lưu của 1 bản ghi.
async function dinhKhoan(table: 'expense_transactions' | 'income_transactions', id: string) {
  const r = await db.query<{ dinh_khoan_no: string | null; dinh_khoan_co: string | null }>(
    `select dinh_khoan_no, dinh_khoan_co from ${table} where id = $1`,
    [id],
  )
  return r.rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  // Prelude: giả lập môi trường Supabase (roles + auth.uid) như harness gốc.
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
  // User chief_accountant để kbit_can_edit() = true.
  await val<string>(
    `insert into users(auth_id, full_name, email, role) values ($1,'KTT Test','ktt@test.local','chief_accountant') returning id`,
    [FIXED_UID],
  )
  companyId = await val<string>(
    `insert into companies(code,name,country,base_currency) values ('TSTCO','Test Co','VN','VND') returning id`,
  )
  bankVnd = await val<string>(
    `insert into bank_accounts(company_id,name,currency) values ($1,'BANK VND','VND') returning id`,
    [companyId],
  )
  bankKrw = await val<string>(
    `insert into bank_accounts(company_id,name,currency) values ($1,'BANK KRW','KRW') returning id`,
    [companyId],
  )
  custId = await val<string>(
    `insert into customers(code,name) values ('KH01','KH Test') returning id`,
  )
  const supId = await val<string>(
    `insert into suppliers(code,name,country) values ('NCC01','NCC Test','VN') returning id`,
  )
  soVnd = await val<string>(
    `insert into supplier_orders(company_id,supplier_id,order_code,order_type,order_date,currency,goods_value)
     values ($1,$2,'PO-VN-1','domestic',current_date,'VND',5000000) returning id`,
    [companyId, supId],
  )
  soKrw = await val<string>(
    `insert into supplier_orders(company_id,supplier_id,order_code,order_type,order_date,currency,goods_value,exchange_rate)
     values ($1,$2,'PO-KR-1','import',current_date,'KRW',1000000,18) returning id`,
    [companyId, supId],
  )
}, 180_000)

describe('Định khoản tay (Nợ/Có) — lưu đúng vào phiếu thu & chi', () => {
  it('kbit_create_expense_vn: lưu định khoản 642 / 112', async () => {
    const id = await val<string>(
      `select kbit_create_expense_vn(
         p_company_id => $1, p_bank_account_id => $2, p_txn_date => current_date,
         p_amount_vnd => 1000000,
         p_dinh_khoan_no => '642', p_dinh_khoan_co => '112')`,
      [companyId, bankVnd],
    )
    expect(await dinhKhoan('expense_transactions', id)).toEqual({ dinh_khoan_no: '642', dinh_khoan_co: '112' })
  })

  it('kbit_create_expense_kr: lưu định khoản 642 / 112', async () => {
    const id = await val<string>(
      `select kbit_create_expense_kr(
         p_company_id => $1, p_bank_account_id => $2,
         p_amount_krw => 1000000, p_exchange_rate => 18,
         p_txn_date => current_date, p_expense_kind => 'goods'::expense_kind,
         p_dinh_khoan_no => '642', p_dinh_khoan_co => '112')`,
      [companyId, bankKrw],
    )
    expect(await dinhKhoan('expense_transactions', id)).toEqual({ dinh_khoan_no: '642', dinh_khoan_co: '112' })
  })

  it('kbit_pay_vn_supplier: lưu định khoản 331 / 112', async () => {
    const id = await val<string>(
      `select kbit_pay_vn_supplier(
         p_supplier_order_id => $1, p_bank_account_id => $2,
         p_amount_vnd => 2000000, p_txn_date => current_date,
         p_dinh_khoan_no => '331', p_dinh_khoan_co => '112')`,
      [soVnd, bankVnd],
    )
    expect(await dinhKhoan('expense_transactions', id)).toEqual({ dinh_khoan_no: '331', dinh_khoan_co: '112' })
  })

  it('kbit_pay_kr_supplier: lưu định khoản 331 / 112', async () => {
    const id = await val<string>(
      `select kbit_pay_kr_supplier(
         p_supplier_order_id => $1, p_bank_account_id => $2,
         p_amount_krw => 500000, p_rate_settled => 18.5, p_txn_date => current_date,
         p_dinh_khoan_no => '331', p_dinh_khoan_co => '112')`,
      [soKrw, bankKrw],
    )
    expect(await dinhKhoan('expense_transactions', id)).toEqual({ dinh_khoan_no: '331', dinh_khoan_co: '112' })
  })

  it('kbit_record_income: lưu định khoản 112 / 131', async () => {
    const id = await val<string>(
      `select kbit_record_income(
         p_company_id => $1, p_bank_account_id => $2, p_customer_id => $3,
         p_amount => 3000000, p_txn_date => current_date, p_note => 'thu test',
         p_allocations => '{}'::income_alloc_input[],
         p_dinh_khoan_no => '112', p_dinh_khoan_co => '131')`,
      [companyId, bankVnd, custId],
    )
    expect(await dinhKhoan('income_transactions', id)).toEqual({ dinh_khoan_no: '112', dinh_khoan_co: '131' })
  })
})
