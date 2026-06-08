// Test NỚI QUYỀN DUYỆT trên Postgres thật (PGlite):
// - CEO có quyền duyệt (kbit_can_approve).
// - Admin/KTT/CEO được TỰ duyệt (approved_by = created_by); kế toán thường thì KHÔNG.
// auth.uid() đọc từ current_setting('test.uid') để giả lập đăng nhập từng vai trò.
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')

let db: PGlite
let companyId: string, bankId: string, custId: string
const A = { admin: '', ktt: '', ceo: '', acc: '' }          // users.id
const AUTH = { admin: '11111111-1111-1111-1111-111111111111', ktt: '22222222-2222-2222-2222-222222222222', ceo: '33333333-3333-3333-3333-333333333333', acc: '44444444-4444-4444-4444-444444444444' }

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params)
  return Object.values(r.rows[0])[0]
}
const setUser = (authId: string) => db.query(`select set_config('test.uid', $1, false)`, [authId])
async function mkIncome(createdBy: string): Promise<string> {
  return val<string>(
    `insert into income_transactions(company_id,bank_account_id,customer_id,amount,txn_date,status,created_by)
     values ($1,$2,$3,1000000,'2026-06-10','confirmed',$4) returning id`,
    [companyId, bankId, custId, createdBy])
}
const approve = (id: string) => db.query(`update income_transactions set status='approved' where id=$1`, [id])
const canApprove = (authId: string) => setUser(authId).then(() => val<boolean>(`select kbit_can_approve()`))

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create or replace function auth.uid()  returns uuid  language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create or replace function auth.role() returns text  language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt()  returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  `)
  for (const f of readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))
  }
  A.admin = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'Admin','admin@t.local','admin') returning id`, [AUTH.admin])
  A.ktt   = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'KTT','ktt@t.local','chief_accountant') returning id`, [AUTH.ktt])
  A.ceo   = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'CEO','ceo@t.local','ceo') returning id`, [AUTH.ceo])
  A.acc   = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'KT','kt@t.local','accountant') returning id`, [AUTH.acc])
  companyId = await val<string>(`insert into companies(code,name,country,base_currency) values ('AP','Cty AP','VN','VND') returning id`)
  bankId    = await val<string>(`insert into bank_accounts(company_id,name,currency) values ($1,'TK AP','VND') returning id`, [companyId])
  custId    = await val<string>(`insert into customers(code,name) values ('KHAP','KH AP') returning id`)
})

describe('Nới quyền duyệt (CEO + tự duyệt cho admin/KTT/CEO)', () => {
  it('CEO có quyền duyệt; admin/KTT cũng có; kế toán thường KHÔNG', async () => {
    expect(await canApprove(AUTH.ceo)).toBe(true)
    expect(await canApprove(AUTH.admin)).toBe(true)
    expect(await canApprove(AUTH.ktt)).toBe(true)
    expect(await canApprove(AUTH.acc)).toBe(false)
  })

  it('KTT TỰ duyệt (người nhập = người duyệt) → ĐƯỢC', async () => {
    const id = await mkIncome(A.ktt)
    await setUser(AUTH.ktt)
    await approve(id)
    const r = await db.query<{ status: string; approved_by: string; created_by: string }>(
      `select status, approved_by, created_by from income_transactions where id=$1`, [id])
    expect(r.rows[0].status).toBe('approved')
    expect(r.rows[0].approved_by).toBe(r.rows[0].created_by)   // tự duyệt
  })

  it('CEO TỰ duyệt → ĐƯỢC', async () => {
    const id = await mkIncome(A.ceo)
    await setUser(AUTH.ceo)
    await approve(id)
    expect(await val<string>(`select status from income_transactions where id=$1`, [id])).toBe('approved')
  })

  it('Kế toán thường TỰ duyệt → BỊ CHẶN', async () => {
    const id = await mkIncome(A.acc)
    await setUser(AUTH.acc)
    await expect(approve(id)).rejects.toThrow()
  })

  it('Tách người vẫn OK: KTT nhập, Admin duyệt → approved_by ≠ created_by', async () => {
    const id = await mkIncome(A.ktt)
    await setUser(AUTH.admin)
    await approve(id)
    const r = await db.query<{ approved_by: string; created_by: string }>(
      `select approved_by, created_by from income_transactions where id=$1`, [id])
    expect(r.rows[0].approved_by).not.toBe(r.rows[0].created_by)
  })
})
