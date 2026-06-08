// Test "Kho chính" (is_default) trên Postgres thật (PGlite): ràng buộc 1 kho chính/công ty
// + hàm kbit_default_warehouse(company) chọn kho tự động. Dựng DB từ TOÀN BỘ migrations.
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')

let db: PGlite
async function val<T = string>(sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await db.query<Record<string, T>>(sql, params)
  return r.rows.length ? Object.values(r.rows[0])[0] : null
}
let coSeq = 0, whSeq = 0
async function freshCompany(): Promise<string> {
  coSeq += 1
  return (await val<string>(
    `insert into companies(code,name,country,base_currency) values ($1,$2,'VN','VND') returning id`,
    [`WDCO-${coSeq}`, `Cty ${coSeq}`]))!
}
async function addWh(companyId: string, code: string, opts: { active?: boolean; isDefault?: boolean } = {}): Promise<string> {
  whSeq += 1
  return (await val<string>(
    `insert into warehouses(code,name,company_id,is_active,is_default) values ($1,$2,$3,$4,$5) returning id`,
    [`${code}-${whSeq}`, code, companyId, opts.active ?? true, opts.isDefault ?? false]))!
}
const pickDefault = (companyId: string) => val<string>(`select kbit_default_warehouse($1)`, [companyId])

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
  await val(`insert into users(auth_id,full_name,email,role) values ($1,'KTT','ktt@test.local','chief_accountant') returning id`, [FIXED_UID])
}, 180_000)

describe('Kho chính (is_default) + kbit_default_warehouse', () => {
  it('công ty 1 kho → trả đúng kho đó', async () => {
    const co = await freshCompany()
    const w = await addWh(co, 'AAA')
    expect(await pickDefault(co)).toBe(w)
  })

  it('nhiều kho, có 1 kho chính → trả kho chính (kể cả code lớn hơn)', async () => {
    const co = await freshCompany()
    await addWh(co, 'AAA')                          // code nhỏ, KHÔNG default
    const main = await addWh(co, 'ZZZ', { isDefault: true })  // code lớn, default
    expect(await pickDefault(co)).toBe(main)
  })

  it('nhiều kho, không có kho chính → trả kho code nhỏ nhất', async () => {
    const co = await freshCompany()
    const small = await addWh(co, 'BBB')
    await addWh(co, 'CCC')
    expect(await pickDefault(co)).toBe(small)
  })

  it('công ty không có kho → null', async () => {
    const co = await freshCompany()
    expect(await pickDefault(co)).toBeNull()
  })

  it('bỏ qua kho ngừng hoạt động (is_active=false)', async () => {
    const co = await freshCompany()
    await addWh(co, 'AAA', { active: false })
    const live = await addWh(co, 'DDD', { active: true })
    expect(await pickDefault(co)).toBe(live)
  })

  it('ràng buộc: không cho 2 kho chính cùng 1 công ty', async () => {
    const co = await freshCompany()
    await addWh(co, 'AAA', { isDefault: true })
    await expect(addWh(co, 'EEE', { isDefault: true })).rejects.toThrow()
  })

  it('2 công ty khác nhau đều có kho chính riêng → không xung đột', async () => {
    const co1 = await freshCompany(); const co2 = await freshCompany()
    const w1 = await addWh(co1, 'AAA', { isDefault: true })
    const w2 = await addWh(co2, 'AAA', { isDefault: true })
    expect(await pickDefault(co1)).toBe(w1)
    expect(await pickDefault(co2)).toBe(w2)
  })
})
