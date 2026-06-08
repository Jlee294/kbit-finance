// Test bảng "Loại thuế" (tax_types) trên Postgres thật (PGlite): seed mặc định + code unique
// + is_active. Dựng DB từ TOÀN BỘ migrations.
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
}, 180_000)

describe('Loại thuế (tax_types)', () => {
  it('seed mặc định đủ 5 loại (GTGT, TNDN, TNCN, FCT, BHXH)', async () => {
    const n = await val<string>(`select count(*)::text from tax_types`)
    expect(Number(n)).toBe(5)
    const names = (await db.query<{ code: string }>(`select code from tax_types order by sort_order`)).rows.map(r => r.code)
    expect(names).toEqual(['GTGT', 'TNDN', 'TNCN', 'FCT', 'BHXH'])
  })

  it('code là duy nhất (không thêm trùng)', async () => {
    await expect(db.query(`insert into tax_types(code,name) values ('GTGT','Trùng')`)).rejects.toThrow()
  })

  it('is_active mặc định = true', async () => {
    await db.query(`insert into tax_types(code,name,sort_order) values ('TEST1','Thuế test',99)`)
    const active = await val<boolean>(`select is_active from tax_types where code='TEST1'`)
    expect(active).toBe(true)
  })

  it('có thể ẩn loại thuế (is_active=false) — không xóa cứng', async () => {
    await db.query(`update tax_types set is_active=false where code='TEST1'`)
    const active = await val<boolean>(`select is_active from tax_types where code='TEST1'`)
    expect(active).toBe(false)
  })
})

describe('tax_compliance_calendar có cột note (regression: trang Lịch thuế đọc/ghi note)', () => {
  it('insert + đọc note OK', async () => {
    const co = await val<string>(`insert into companies(code,name,country,base_currency) values ('TCN','Cty Note','VN','VND') returning id`)
    await db.query(`insert into tax_compliance_calendar(company_id,tax_type,period,due_date,status,note) values ($1,'GTGT','2026-01','2026-02-20','pending','ghi chú test')`, [co])
    expect(await val<string>(`select note from tax_compliance_calendar where company_id=$1`, [co])).toBe('ghi chú test')
  })
})
