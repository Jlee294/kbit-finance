import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const fixedAuthId = '00000000-0000-0000-0000-000000000001'
const patchMigration = (sql: string) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skipped in PGlite')

let db: PGlite
let companyId: string
let customerId: string
let supplierId: string
let warehouseId: string
let productId: string
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
      as $$ select '${fixedAuthId}'::uuid $$;
    create or replace function auth.role() returns text language sql stable
      as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable
      as $$ select '{}'::jsonb $$;
  `)

  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(patchMigration(readFileSync(path.join(migrationDir, file), 'utf8')))
  }

  await db.query(`insert into auth.users(id) values ($1)`, [fixedAuthId])
  userId = await scalar(
    `insert into users(auth_id,full_name,email,role,is_active)
     values ($1,'Admin test','admin-flow@kbit.test','admin',true) returning id`,
    [fixedAuthId],
  )
  companyId = await scalar(
    `insert into companies(code,name,country,base_currency)
     values ('FLOW','Flow test','VN','VND') returning id`,
  )
  customerId = await scalar(
    `insert into customers(code,name,tax_code)
     values ('KH00001','Khách test','0100000001') returning id`,
  )
  supplierId = await scalar(
    `insert into suppliers(code,name,country,tax_code)
     values ('NCC00001','NCC test','VN','0100000002') returning id`,
  )
  warehouseId = await scalar(
    `insert into warehouses(company_id,code,name,is_default)
     values ($1,'KHO','Kho test',true) returning id`,
    [companyId],
  )
  productId = await scalar(
    `insert into products(code,name,unit)
     values ('MH00001','Mặt hàng test','Cái') returning id`,
  )
}, 180_000)

describe('hóa đơn quà tặng và nhật ký là tập con bảng kê', () => {
  it('lưu được quà tặng không doanh thu, không công nợ nhưng vẫn kê VAT', async () => {
    const id = await scalar<string>(
      `insert into customer_orders(
         company_id, customer_id, order_code, order_date, invoice_date,
         grand_total, vat_amount, is_gift, recognize_revenue, creates_receivable
       ) values ($1,$2,'GIFT-1','2026-01-02','2026-01-02',1100000,100000,true,false,false)
       returning id`,
      [companyId, customerId],
    )
    const row = await db.query<{
      is_gift: boolean
      recognize_revenue: boolean
      creates_receivable: boolean
    }>(
      `select is_gift, recognize_revenue, creates_receivable
       from customer_orders where id=$1`,
      [id],
    )
    expect(row.rows[0]).toEqual({
      is_gift: true,
      recognize_revenue: false,
      creates_receivable: false,
    })
  })

  it('view nhật ký chỉ lấy hóa đơn có dòng gắn mã hàng', async () => {
    const stockOrder = await scalar<string>(
      `insert into customer_orders(company_id,customer_id,order_code,order_date,invoice_date,grand_total)
       values ($1,$2,'STOCK-1','2026-01-03','2026-01-03',1000000) returning id`,
      [companyId, customerId],
    )
    const serviceOrder = await scalar<string>(
      `insert into customer_orders(company_id,customer_id,order_code,order_date,invoice_date,grand_total)
       values ($1,$2,'SERVICE-1','2026-01-04','2026-01-04',500000) returning id`,
      [companyId, customerId],
    )
    await db.query(
      `insert into customer_order_items(order_id,product_id,description,qty,unit_price)
       values ($1,$2,'Hàng',1,1000000),($3,null,'Dịch vụ',1,500000)`,
      [stockOrder, productId, serviceOrder],
    )
    const rows = await db.query<{ order_code: string }>(
      `select order_code from sales_inventory_journal
       where company_id=$1 order by order_code`,
      [companyId],
    )
    expect(rows.rows.map((row) => row.order_code)).toContain('STOCK-1')
    expect(rows.rows.map((row) => row.order_code)).not.toContain('SERVICE-1')
  })
})

describe('công nợ mua vào', () => {
  it('hóa đơn mua trong nước gồm VAT trong số phải trả', async () => {
    const row = await db.query<{ payable_total: string; payable_outstanding: string }>(
      `insert into supplier_orders(
         company_id,supplier_id,order_code,order_type,order_date,goods_value,vat_amount
       ) values ($1,$2,'MV-1','domestic','2026-01-05',10000000,1000000)
       returning payable_total,payable_outstanding`,
      [companyId, supplierId],
    )
    expect(Number(row.rows[0].payable_total)).toBe(11_000_000)
    expect(Number(row.rows[0].payable_outstanding)).toBe(11_000_000)
  })

  it('chi phí nhập khẩu tách chủ nợ và đồng tiền', async () => {
    const orderId = await scalar<string>(
      `insert into supplier_orders(
         company_id,supplier_id,order_code,order_type,order_date,currency,exchange_rate,goods_value
       ) values ($1,$2,'NK-1','import','2026-01-05','KRW',18,1000000)
       returning id`,
      [companyId, supplierId],
    )
    await db.query(
      `insert into import_cost_components(
         company_id,supplier_order_id,kind,creditor_type,creditor_supplier_id,
         currency,amount,exchange_rate,capitalizable
       ) values
         ($1,$2,'goods','supplier',$3,'KRW',1000000,18,true),
         ($1,$2,'import_duty','tax_authority',null,'VND',10000000,1,true),
         ($1,$2,'import_vat','tax_authority',null,'VND',11000000,1,false)`,
      [companyId, orderId, supplierId],
    )
    const totals = await db.query<{ landed: string; payable: string }>(
      `select
         sum(case when capitalizable then amount_vnd else 0 end) as landed,
         sum(amount_vnd) as payable
       from import_cost_components where supplier_order_id=$1`,
      [orderId],
    )
    expect(Number(totals.rows[0].landed)).toBe(28_000_000)
    expect(Number(totals.rows[0].payable)).toBe(39_000_000)
  })
})

describe('tiền mặt, phân loại mua và staging', () => {
  it('lưu được tiền mặt đầu kỳ theo công ty và năm', async () => {
    const balance = await scalar<string>(
      `insert into cash_opening_balances(company_id,year,amount)
       values ($1,2026,25000000) returning amount`,
      [companyId],
    )
    expect(Number(balance)).toBe(25_000_000)
  })

  it('có danh mục mặc định và cho phép danh mục riêng công ty', async () => {
    const defaultCount = await scalar<string>(
      `select count(*) from accounting_categories where company_id is null`,
    )
    expect(Number(defaultCount)).toBeGreaterThanOrEqual(8)

    const customCode = await scalar<string>(
      `insert into accounting_categories(company_id,code,name,treatment)
       values ($1,'CUSTOM','Danh mục riêng','other') returning code`,
      [companyId],
    )
    expect(customCode).toBe('CUSTOM')
  })

  it('lô nhập có trạng thái, checksum và bảng kiểm tra', async () => {
    const batchId = await scalar<string>(
      `insert into import_batches(company_id,period_from,period_to,source_label)
       values ($1,'2026-01-01','2026-06-30','GLA') returning id`,
      [companyId],
    )
    await db.query(
      `insert into import_files(batch_id,kind,filename,sha256)
       values ($1,'sales_listing','ban-ra.xls','abc123')`,
      [batchId],
    )
    await db.query(
      `insert into import_checks(batch_id,check_code,status,expected_value,actual_value)
       values ($1,'SALES_TOTAL','passed',100,100)`,
      [batchId],
    )
    const status = await scalar<string>(
      `select status from import_batches where id=$1`,
      [batchId],
    )
    expect(status).toBe('draft')
  })
})

describe('ghi sổ và hoàn tác lô import', () => {
  it('ghi đầu kỳ trước, nhập trước xuất cùng ngày và hoàn tác nguyên lô', async () => {
    const batchId = await scalar<string>(
      `insert into import_batches(
         company_id,period_from,period_to,source_label,status,created_by
       ) values ($1,'2026-01-01','2026-06-30','POST FLOW','approved',$2)
       returning id`,
      [companyId, userId],
    )

    const inventoryFileId = await scalar<string>(
      `insert into import_files(batch_id,kind,filename,sha256)
       values ($1,'inventory','nxt.xlsx','post-inventory') returning id`,
      [batchId],
    )
    const purchaseListingFileId = await scalar<string>(
      `insert into import_files(batch_id,kind,filename,sha256)
       values ($1,'purchase_listing','purchase-listing.xlsx','post-purchase-listing') returning id`,
      [batchId],
    )
    const purchaseJournalFileId = await scalar<string>(
      `insert into import_files(batch_id,kind,filename,sha256)
       values ($1,'purchase_journal','purchase-journal.xlsx','post-purchase-journal') returning id`,
      [batchId],
    )
    const salesListingFileId = await scalar<string>(
      `insert into import_files(batch_id,kind,filename,sha256)
       values ($1,'sales_listing','sales-listing.xlsx','post-sales-listing') returning id`,
      [batchId],
    )
    const salesJournalFileId = await scalar<string>(
      `insert into import_files(batch_id,kind,filename,sha256)
       values ($1,'sales_journal','sales-journal.xlsx','post-sales-journal') returning id`,
      [batchId],
    )

    await db.query(
      `insert into import_staging_rows(
         batch_id,file_id,row_number,row_kind,reconciliation_key,raw_data,normalized_data
       ) values
       ($1,$2,1,'inventory','POST-MH','{}',$3::jsonb),
       ($1,$4,1,'purchase_listing','PM-1|2026-02-01','{}',$5::jsonb),
       ($1,$6,1,'purchase_journal','PM-1|2026-02-01','{}',$7::jsonb),
       ($1,$8,1,'sales_listing','SM-1|2026-02-01','{}',$9::jsonb),
       ($1,$10,1,'sales_journal','SM-1|2026-02-01','{}',$11::jsonb)`,
      [
        batchId,
        inventoryFileId,
        JSON.stringify({
          product_code: 'POST-MH',
          product_name: 'Mặt hàng kiểm thử ghi sổ',
          unit: 'cái',
          opening_quantity: 10,
          opening_value: 1000,
          receipt_quantity: 5,
          receipt_value: 500,
          issue_quantity: 3,
          issue_value: 300,
          closing_quantity: 12,
          closing_value: 1200,
        }),
        purchaseListingFileId,
        JSON.stringify({
          invoice_no: 'PM-1',
          invoice_date: '2026-02-01',
          partner_name: 'Nhà cung cấp ghi sổ',
          tax_code: '0100000099',
          subtotal: 500,
          vat_amount: 50,
          grand_total: 550,
          order_type: 'domestic',
        }),
        purchaseJournalFileId,
        JSON.stringify({
          invoice_no: 'PM-1',
          invoice_date: '2026-02-01',
          product_code: 'POST-MH',
          product_name: 'Mặt hàng kiểm thử ghi sổ',
          unit: 'cái',
          quantity: 5,
          unit_price: 100,
          amount: 500,
        }),
        salesListingFileId,
        JSON.stringify({
          invoice_no: 'SM-1',
          invoice_date: '2026-02-01',
          partner_name: 'Khách hàng ghi sổ',
          tax_code: '0100000088',
          subtotal: 600,
          vat_amount: 60,
          grand_total: 660,
          is_gift: false,
        }),
        salesJournalFileId,
        JSON.stringify({
          invoice_no: 'SM-1',
          invoice_date: '2026-02-01',
          product_code: 'POST-MH',
          product_name: 'Mặt hàng kiểm thử ghi sổ',
          unit: 'cái',
          quantity: 3,
          unit_price: 200,
          amount: 600,
        }),
      ],
    )

    const posted = await scalar<{ warehouse_rows: number }>(
      `select kbit_post_import_batch($1)`,
      [batchId],
    )
    expect(Number(posted.warehouse_rows)).toBe(3)

    const stock = await scalar<string>(
      `select ws.qty_on_hand
         from warehouse_stock ws
         join products p on p.id=ws.product_id
        where ws.warehouse_id=$1 and p.code='POST-MH'`,
      [warehouseId],
    )
    expect(Number(stock)).toBe(12)

    const cost = await scalar<string>(
      `select coi.cost_price
         from customer_order_items coi
         join customer_orders co on co.id=coi.order_id
        where co.import_batch_id=$1`,
      [batchId],
    )
    expect(Number(cost)).toBe(100)
    expect(await scalar<string>(`select status from import_batches where id=$1`, [batchId])).toBe('posted')

    await db.query(`select kbit_rollback_import_batch($1)`, [batchId])

    expect(await scalar<string>(`select status from import_batches where id=$1`, [batchId])).toBe('rolled_back')
    expect(Number(await scalar<string>(
      `select count(*) from customer_orders where import_batch_id=$1`,
      [batchId],
    ))).toBe(0)
    expect(Number(await scalar<string>(
      `select count(*) from supplier_orders where import_batch_id=$1`,
      [batchId],
    ))).toBe(0)
  })
})
