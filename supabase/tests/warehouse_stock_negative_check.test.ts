// =====================================================================
// Test kho — CHO PHÉP tồn âm (migration 0027).
//
// ĐỔI TRIẾT LÝ: trước đây 0012/0025 CHẶN xuất quá tồn bằng
//   constraint warehouse_stock_non_negative (qty_on_hand >= 0).
// Anh Thịnh chốt CHO PHÉP kho ghi âm (xuất bán dù tồn hệ thống chưa kịp
//   cập nhật; tồn âm hiển thị ĐỎ ở UI để nhập bù). 0027 gỡ constraint đó.
//
// Test xác minh: (a) xuất hợp lệ vẫn ra ĐÚNG số; (b) xuất QUÁ tồn → tồn
//   xuống ÂM và KHÔNG báo lỗi (mọi thao tác xuất kho).
//
// Cơ chế: dựng Postgres thật bằng PGlite, apply TOÀN BỘ migrations, gọi RPC.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'

function patch(sql: string): string {
  return sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- [test] pgcrypto skipped')
}

let db: PGlite
let whVN: string
let whBB: string
let userId: string

async function val<T = string>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params)
  return Object.values(r.rows[0])[0]
}

// Tồn hiện tại của 1 mã hàng tại 1 kho (0 nếu chưa có dòng).
async function qty(wh: string, prod: string): Promise<number> {
  const r = await db.query<{ q: string }>(
    `select coalesce(
       (select qty_on_hand from warehouse_stock where warehouse_id=$1 and product_id=$2), 0
     )::text q`,
    [wh, prod],
  )
  return Number(r.rows[0].q)
}

let prodSeq = 0
async function freshProduct(): Promise<string> {
  prodSeq += 1
  return val<string>(`insert into products(code,name,unit) values ($1,$2,'cái') returning id`, [
    `TST-WH-${prodSeq}`,
    `SP test ${prodSeq}`,
  ])
}

const receive = (wh: string, p: string, n: number) =>
  db.query(`select kbit_receive_stock($1,$2,$3,current_date,'nhập test',$4)`, [wh, p, n, userId])
const issue = (wh: string, p: string, n: number) =>
  db.query(`select kbit_issue_stock($1,$2,$3,'sale'::issue_reason,current_date,'xuất test',$4)`, [wh, p, n, userId])
const adjust = (wh: string, p: string, delta: number) =>
  db.query(`select kbit_adjust_stock($1,$2,$3)`, [wh, p, delta])
const deduct = (wh: string, p: string, n: number) =>
  db.query(`select kbit_deduct_order_item($1,$2,$3,null::uuid,$4)`, [wh, p, n, userId])
const transfer = (from: string, to: string, p: string, n: number) =>
  db.query(`select kbit_transfer_stock_full($1,$2,$3,$4,current_date,'chuyển test',$5)`, [from, to, p, n, userId])

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
  userId = await val<string>(
    `insert into users(auth_id, full_name, email, role) values ($1,'KTT Test','ktt@test.local','chief_accountant') returning id`,
    [FIXED_UID],
  )
  await db.query(`insert into companies(code,name,country,base_currency) values ('TSTCO','Test Co','VN','VND')`)
  whVN = await val<string>(`select id from warehouses where code='KHO-VN'`)
  whBB = await val<string>(`select id from warehouses where code='KHO-BB'`)
}, 180_000)

describe('Kho — CHO PHÉP tồn âm (0027 gỡ chặn của 0012/0025)', () => {
  it('kbit_issue_stock: nhập 100, xuất 30 → tồn = 70 (xuất hợp lệ ra đúng số)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100)
    await issue(whVN, p, 30)
    expect(await qty(whVN, p)).toBe(70)
  })

  it('kbit_issue_stock: xuất QUÁ tồn cho phép âm (nhập 100, xuất 150 → −50, KHÔNG lỗi)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100)
    await expect(issue(whVN, p, 150)).resolves.toBeDefined()
    expect(await qty(whVN, p)).toBe(-50)
  })

  it('kbit_adjust_stock: +100 rồi −30 → 70; điều chỉnh âm vượt tồn → âm (KHÔNG lỗi)', async () => {
    const p = await freshProduct()
    await adjust(whVN, p, 100)
    await adjust(whVN, p, -30)
    expect(await qty(whVN, p)).toBe(70)
    await expect(adjust(whVN, p, -200)).resolves.toBeDefined()
    expect(await qty(whVN, p)).toBe(-130)
  })

  it('kbit_deduct_order_item: nhập 100, trừ 30 → 70; trừ vượt → âm (KHÔNG lỗi)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100)
    await deduct(whVN, p, 30)
    expect(await qty(whVN, p)).toBe(70)
    await expect(deduct(whVN, p, 200)).resolves.toBeDefined()
    expect(await qty(whVN, p)).toBe(-130)
  })

  it('kbit_transfer_stock_full: chuyển 30 VN→BB → VN70/BB30 + 2 dòng sổ; chuyển vượt → nguồn âm (KHÔNG rollback)', async () => {
    const p = await freshProduct()
    await receive(whVN, p, 100)
    await transfer(whVN, whBB, p, 30)
    expect(await qty(whVN, p)).toBe(70)
    expect(await qty(whBB, p)).toBe(30)

    const txns = await db.query(
      `select txn_type from warehouse_transactions
       where product_id=$1 and txn_type in ('transfer_out','transfer_in')`,
      [p],
    )
    expect(txns.rows.length).toBe(2)

    // Chuyển vượt tồn kho nguồn → cho phép nguồn xuống âm, KHÔNG lỗi.
    await expect(transfer(whVN, whBB, p, 100)).resolves.toBeDefined()
    expect(await qty(whVN, p)).toBe(-30)
    expect(await qty(whBB, p)).toBe(130)
  })
})
