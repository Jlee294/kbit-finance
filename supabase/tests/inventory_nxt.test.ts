// Test bảng Nhập-Xuất-Tồn (kbit_inventory_nxt) trên Postgres thật (PGlite).
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const patch = (sql: string) => sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, whVN: string, whKR: string, userId: string
async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params); return Object.values(r.rows[0])[0]
}
let seq = 0
async function freshProduct(): Promise<string> {
  seq += 1; return val<string>(`insert into products(code,name,unit) values ($1,$2,'cái') returning id`, [`NXT-${seq}`, `SP ${seq}`])
}
const receive = (wh: string, p: string, n: number, c: number | null, d: string) =>
  db.query(`select kbit_receive_stock($1,$2,$3,$4::date,'r',$5,$6)`, [wh, p, n, d, userId, c])
const issue = (wh: string, p: string, n: number, d: string) =>
  db.query(`select kbit_issue_stock($1,$2,$3,'sale'::issue_reason,$4::date,'i',$5)`, [wh, p, n, d, userId])
const transfer = (a: string, b: string, p: string, n: number, d: string) =>
  db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,$5::date,'t',$6)`, [a, b, p, n, d, userId])
const opening = (p: string, wh: string, period: string, n: number, c: number) =>
  db.query(`select kbit_set_opening_stock($1,$2,$3,$4,$5)`, [p, wh, period, n, c])
async function nxt(period: string, wh: string | null, productId: string) {
  const r = await db.query<Record<string, string>>(`select * from kbit_inventory_nxt($1,$2) where product_id=$3`, [period, wh, productId])
  return r.rows[0]
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
  await db.query(`insert into companies(code,name,country,base_currency) values ('T','T','VN','VND')`)
  whVN = await val<string>(`select id from warehouses where code='KHO-VN'`)
  whKR = await val<string>(`select id from warehouses where code='KHO-KR'`)
}, 180_000)

describe('kbit_inventory_nxt — bảng Nhập-Xuất-Tồn', () => {
  it('tổng: opening đầu kỳ + nhập + xuất ra số đúng + bảo toàn', async () => {
    const p = await freshProduct()
    await opening(p, whVN, '2026-09', 100, 50)        // tồn đầu 100@50 = 5000
    await receive(whVN, p, 20, 60, '2026-09-10')      // nhập 20@60 = 1200
    await issue(whVN, p, 30, '2026-09-15')            // xuất 30
    const r = await nxt('2026-09', null, p)
    expect(Number(r.qty_open)).toBe(100); expect(Number(r.value_open)).toBe(5000)
    expect(Number(r.qty_in)).toBe(20);    expect(Number(r.value_in)).toBe(1200)
    expect(Number(r.qty_out)).toBe(30)
    expect(Number(r.qty_close)).toBe(90)
    expect(Number(r.value_open) + Number(r.value_in)).toBeCloseTo(Number(r.value_out) + Number(r.value_close), 2)
  })
  it('TỔNG mọi kho: luân chuyển KHÔNG vào Nhập/Xuất (net 0)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 10, '2026-09-02')
    await transfer(whVN, whKR, p, 40, '2026-09-12')   // nội bộ
    const r = await nxt('2026-09', null, p)
    expect(Number(r.qty_in)).toBe(100)                // chỉ receipt
    expect(Number(r.qty_out)).toBe(0)                 // transfer KHÔNG vào xuất
    expect(Number(r.qty_close)).toBe(100)
  })
  it('LỌC 1 kho: transfer_in = nhập kho đích, transfer_out = xuất kho nguồn', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100, 10, '2026-09-02')
    await transfer(whVN, whKR, p, 40, '2026-09-12')
    const vn = await nxt('2026-09', whVN, p)
    expect(Number(vn.qty_in)).toBe(100); expect(Number(vn.qty_out)).toBe(40); expect(Number(vn.qty_close)).toBe(60)
    const kr = await nxt('2026-09', whKR, p)
    expect(Number(kr.qty_in)).toBe(40); expect(Number(kr.qty_out)).toBe(0); expect(Number(kr.qty_close)).toBe(40)
  })
  it('mã không hoạt động → KHÔNG xuất hiện; mã có tồn mang sang → CÓ', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 10, 10, '2026-05-01')      // phát sinh tháng 5 → tháng 9 tồn đầu 10
    const r = await db.query(`select * from kbit_inventory_nxt('2026-09', null) where product_id=$1`, [p])
    expect(r.rows.length).toBe(1)
    const p2 = await freshProduct()                    // không phát sinh gì
    const r2 = await db.query(`select * from kbit_inventory_nxt('2026-09', null) where product_id=$1`, [p2])
    expect(r2.rows.length).toBe(0)
  })
})
