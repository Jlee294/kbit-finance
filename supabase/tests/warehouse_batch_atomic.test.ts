// =====================================================================
// TEST NGUYÊN TỬ ghi kho nhiều dòng (migration 0035 — vá edge C-3.3).
// Ghi nhập/trừ kho theo MẢNG trong 1 giao dịch: nếu 1 dòng GIỮA chừng lỗi thì
// TOÀN BỘ rollback (không để dòng trước ghi lén tồn/giá vốn). Đây là điểm yếu
// cũ: vòng lặp ở tầng app, mỗi RPC tự commit → lỗi giữa chừng để lại tồn lệch.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const FIXED_UID = '00000000-0000-0000-0000-000000000001'
const BAD = '99999999-9999-9999-9999-999999999999'   // product_id KHÔNG tồn tại → FK fail giữa chừng
const patch = (s: string) => s.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skip')
let db: PGlite, co: string, wh: string, userId: string, P1: string, P2: string

async function val<T = string>(sql: string, p: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, p); return Object.values(r.rows[0])[0]
}
const receiveBatch = (items: object[], d: string) =>
  db.query(`select kbit_receive_stock_batch($1,$2::jsonb,$3::date,'lô',$4)`, [wh, JSON.stringify(items), d, userId])
const deductBatch = (items: object[], d: string) =>
  db.query(`select kbit_deduct_order_batch($1,$2,$3::jsonb,$4,$5::date)`, [wh, null, JSON.stringify(items), userId, d])
async function mc(p: string): Promise<{ qty: number; avg: number }> {
  const r = await db.query<{ qty_on_hand: string; avg_cost: string }>(
    `select qty_on_hand,avg_cost from product_moving_cost where company_id=$1 and product_id=$2`, [co, p])
  return r.rows[0] ? { qty: Number(r.rows[0].qty_on_hand), avg: Number(r.rows[0].avg_cost) } : { qty: 0, avg: 0 }
}
const txnCount = async () => Number(await val<string>(`select count(*)::text from warehouse_transactions where warehouse_id=$1`, [wh]))

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$ select '${FIXED_UID}'::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;`)
  for (const f of readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort())
    await db.exec(patch(readFileSync(path.join(MIG_DIR, f), 'utf8')))
  userId = await val<string>(`insert into users(auth_id,full_name,email,role) values ($1,'K','k@t.local','chief_accountant') returning id`, [FIXED_UID])
  co = await val<string>(`insert into companies(code,name,country,base_currency) values ('BA','Cty Batch','VN','VND') returning id`)
  wh = await val<string>(`insert into warehouses(code,name,company_id) values ('B','Kho B',$1) returning id`, [co])
  P1 = await val<string>(`insert into products(code,name,unit) values ('P1','SP 1','cai') returning id`)
  P2 = await val<string>(`insert into products(code,name,unit) values ('P2','SP 2','cai') returning id`)
}, 180_000)

describe('Ghi kho nhiều dòng — NGUYÊN TỬ (ăn cả / hủy hết)', () => {
  it('receive_batch nhiều dòng hợp lệ: ghi ĐỦ, giá vốn từng mã đúng', async () => {
    await receiveBatch([{ product_id: P1, qty: 10, unit_cost: 50 }, { product_id: P2, qty: 20, unit_cost: 30 }], '2026-03-01')
    expect(await mc(P1)).toEqual({ qty: 10, avg: 50 })
    expect(await mc(P2)).toEqual({ qty: 20, avg: 30 })
    expect(await txnCount()).toBe(2)
  })

  it('receive_batch lỗi GIỮA chừng (dòng cuối mã sai) → HỦY SẠCH, dòng hợp lệ KHÔNG ghi lén', async () => {
    await expect(
      receiveBatch([{ product_id: P1, qty: 5, unit_cost: 60 }, { product_id: BAD, qty: 3, unit_cost: 70 }], '2026-03-05'),
    ).rejects.toThrow()
    expect(await mc(P1)).toEqual({ qty: 10, avg: 50 })   // KHÔNG cộng 5 của dòng hợp lệ
    expect(await mc(P2)).toEqual({ qty: 20, avg: 30 })
    expect(await txnCount()).toBe(2)                      // vẫn đúng 2 dòng từ ca trước
  })

  it('deduct_batch hợp lệ: trừ đủ theo bình quân hiện hành', async () => {
    await deductBatch([{ product_id: P1, qty: 4 }, { product_id: P2, qty: 5 }], '2026-03-10')
    expect(await mc(P1)).toEqual({ qty: 6, avg: 50 })
    expect(await mc(P2)).toEqual({ qty: 15, avg: 30 })
  })

  it('deduct_batch lỗi giữa chừng → HỦY SẠCH (tồn không bị trừ lén)', async () => {
    await expect(
      deductBatch([{ product_id: P1, qty: 2 }, { product_id: BAD, qty: 1 }], '2026-03-12'),
    ).rejects.toThrow()
    expect(await mc(P1)).toEqual({ qty: 6, avg: 50 })   // KHÔNG trừ 2 của dòng hợp lệ
  })

  it('batch tôn trọng KHÓA KỲ: cả lô vào kỳ đã khóa → chặn toàn bộ', async () => {
    await db.query(`insert into accounting_periods(company_id,period,status) values ($1,'2026-02','locked')`, [co])
    await expect(receiveBatch([{ product_id: P1, qty: 9, unit_cost: 50 }], '2026-02-15')).rejects.toThrow(/KY_DA_KHOA|đã khóa/)
    expect(await mc(P1)).toEqual({ qty: 6, avg: 50 })   // không đổi
  })
})
