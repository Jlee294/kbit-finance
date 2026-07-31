import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const authId = '00000000-0000-0000-0000-000000000097'
const patchMigration = (sql: string) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skipped in PGlite')

let db: PGlite
let companyId: string
let customerId: string
let supplierId: string
let userId: string

async function scalar<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params)
  return Object.values(result.rows[0])[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema if not exists auth;
    create table if not exists auth.users(id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable
      as $$ select '${authId}'::uuid $$;
    create or replace function auth.role() returns text language sql stable
      as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable
      as $$ select '{}'::jsonb $$;
  `)
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(patchMigration(readFileSync(path.join(migrationDir, file), 'utf8')))
  }
  await db.query(`insert into auth.users(id) values ($1)`, [authId])
  userId = await scalar(
    `insert into users(auth_id,full_name,email,role,is_active)
     values ($1,'Admin bank opening','admin-bank-opening@kbit.test','admin',true) returning id`,
    [authId],
  )
  companyId = await scalar(
    `insert into companies(code,name,country,base_currency)
     values ('BANK-OPEN','Bank opening test','VN','VND') returning id`,
  )
  customerId = await scalar(
    `insert into customers(code,name) values ('KH-BANK-OPEN','Khách test') returning id`,
  )
  supplierId = await scalar(
    `insert into suppliers(code,name,country) values ('NCC-BANK-OPEN','NCC test','VN') returning id`,
  )
}, 180_000)

describe('bank_opening_balances', () => {
  it('lưu theo từng tài khoản/năm và đưa vào số dư ngân hàng chuẩn', async () => {
    const bankAccountId = await scalar<string>(
      `insert into bank_accounts(company_id,name,currency,account_no)
       values ($1,'VCB test','VND','001') returning id`,
      [companyId],
    )
    await db.query(
      `insert into bank_opening_balances(
         company_id,bank_account_id,year,amount,created_by
       ) values ($1,$2,2026,1000,$3)`,
      [companyId, bankAccountId, userId],
    )
    await db.query(
      `insert into income_transactions(
         company_id,bank_account_id,customer_id,amount,txn_date,status,created_by
       ) values
         ($1,$2,$3,999,'2025-12-31','confirmed',$4),
         ($1,$2,$3,500,'2026-01-10','confirmed',$4)`,
      [companyId, bankAccountId, customerId, userId],
    )
    await db.query(
      `insert into expense_transactions(
         company_id,bank_account_id,supplier_id,region,txn_date,amount_vnd,status,created_by
       ) values ($1,$2,$3,'VN','2026-01-20',200,'confirmed',$4)`,
      [companyId, bankAccountId, supplierId, userId],
    )

    const balance = await scalar<string>(
      `select balance from v_bank_balances where bank_account_id=$1`,
      [bankAccountId],
    )
    expect(Number(balance)).toBe(1_300)
  })

  it('chặn khai số dư cho tài khoản ngân hàng của công ty khác', async () => {
    const otherCompanyId = await scalar<string>(
      `insert into companies(code,name,country,base_currency)
       values ('BANK-OTHER','Other company','VN','VND') returning id`,
    )
    const otherBankId = await scalar<string>(
      `insert into bank_accounts(company_id,name,currency)
       values ($1,'Bank other','VND') returning id`,
      [otherCompanyId],
    )
    await expect(db.query(
      `insert into bank_opening_balances(company_id,bank_account_id,year,amount)
       values ($1,$2,2026,100)`,
      [companyId, otherBankId],
    )).rejects.toThrow()
  })
})
