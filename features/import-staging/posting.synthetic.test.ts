import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import {
  buildImportPreview,
  type AccountingFileKind,
  type ParsedAccountingFile,
  type ParsedStagingRow,
} from './parser'
import { buildInvoiceKey } from './reconcile'

const migrationDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
)
const authId = '00000000-0000-0000-0000-000000000098'
const patchMigration = (sql: string) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skipped in PGlite')

async function scalar<T = string>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params)
  return Object.values(result.rows[0])[0]
}

function stagingRow(rowNumber: number, normalized: Record<string, unknown>): ParsedStagingRow {
  return { rowNumber, raw: [rowNumber], normalized }
}

function accountingFile(
  kind: AccountingFileKind,
  rows: ParsedStagingRow[],
  suffix = '',
): ParsedAccountingFile {
  return {
    filename: `${kind}${suffix}.xlsx`,
    kind,
    sheetName: 'DATA',
    sha256: `${kind}-${suffix || 'main'}`,
    rows,
  }
}

function invoiceKey(row: ParsedStagingRow): string | null {
  const invoiceNo = String(row.normalized.invoice_no ?? '').trim()
  const invoiceDate = String(
    row.normalized.posting_invoice_date
    ?? row.normalized.invoice_date
    ?? '',
  ).trim()
  if (invoiceNo && invoiceDate) return buildInvoiceKey({ invoiceNo, invoiceDate })
  return String(row.normalized.product_code ?? row.normalized.partner_code ?? '') || null
}

async function stageFiles(
  db: PGlite,
  batchId: string,
  files: ParsedAccountingFile[],
): Promise<void> {
  for (const file of files) {
    const fileId = await scalar<string>(
      db,
      `insert into import_files(batch_id,kind,filename,sha256,sheet_name,row_count)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [batchId, file.kind, file.filename, file.sha256, file.sheetName, file.rows.length],
    )
    for (const row of file.rows) {
      await db.query(
        `insert into import_staging_rows(
           batch_id,file_id,row_number,row_kind,reconciliation_key,raw_data,normalized_data
         ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
        [
          batchId,
          fileId,
          row.rowNumber,
          file.kind,
          invoiceKey(row),
          JSON.stringify(row.raw),
          JSON.stringify(row.normalized),
        ],
      )
    }
  }
}

async function createCompanyAndBatch(
  db: PGlite,
  userId: string,
  code: string,
): Promise<{ batchId: string; companyId: string; warehouseId: string }> {
  const companyId = await scalar<string>(
    db,
    `insert into companies(code,name,country,base_currency)
     values ($1,$2,'VN','VND') returning id`,
    [code, `${code} synthetic test`],
  )
  const warehouseId = await scalar<string>(
    db,
    `insert into warehouses(company_id,code,name,is_default)
     values ($1,$2,$3,true) returning id`,
    [companyId, `${code}-KHO`, `Kho ${code}`],
  )
  const batchId = await scalar<string>(
    db,
    `insert into import_batches(
       company_id,period_from,period_to,source_label,status,created_by
     ) values ($1,'2026-01-01','2026-06-30',$2,'approved',$3)
     returning id`,
    [companyId, `${code} flow test`, userId],
  )
  return { batchId, companyId, warehouseId }
}

function listingRow(
  rowNumber: number,
  prefix: 'BR' | 'MV',
  invoiceDate: string,
  amount: number,
  partnerCode: string,
  partnerName: string,
  purchaseNature?: 'goods' | 'service',
): ParsedStagingRow {
  return stagingRow(rowNumber, {
    invoice_template: '1',
    invoice_symbol: prefix,
    invoice_no: `${prefix}${String(rowNumber).padStart(3, '0')}`,
    invoice_date: invoiceDate,
    partner_code: partnerCode,
    partner_name: partnerName,
    tax_code: null,
    content: purchaseNature === 'goods' ? 'Mua hàng hóa' : `${prefix} nghiệp vụ ${rowNumber}`,
    subtotal: amount,
    vat_rate: 0,
    vat_amount: 0,
    grand_total: amount,
    is_gift: false,
    ...(prefix === 'MV'
      ? {
          order_type: 'domestic',
          purchase_nature: purchaseNature ?? 'service',
          customs_declaration_no: null,
        }
      : {}),
  })
}

function journalRow(
  rowNumber: number,
  prefix: 'BR' | 'MV',
  invoiceDate: string,
  productCode: string,
  quantity: number,
  amount: number,
): ParsedStagingRow {
  return stagingRow(rowNumber, {
    invoice_no: `${prefix}${String(rowNumber).padStart(3, '0')}`,
    invoice_date: invoiceDate,
    product_code: productCode,
    product_name: 'Sản phẩm kiểm thử luồng',
    unit: 'cái',
    quantity,
    unit_price: amount / quantity,
    amount,
    direction: prefix === 'BR' ? 'issue' : 'receipt',
  })
}

function debtRow(
  rowNumber: number,
  partnerType: 'customer' | 'supplier',
  partnerCode: string,
  partnerName: string,
  openingDebit: number,
  openingCredit: number,
  periodDebit: number,
  periodCredit: number,
  closingDebit: number,
  closingCredit: number,
): ParsedStagingRow {
  return stagingRow(rowNumber, {
    record_type: 'summary',
    partner_type: partnerType,
    partner_code: partnerCode,
    partner_name: partnerName,
    tax_code: null,
    opening_debit: openingDebit,
    opening_credit: openingCredit,
    period_debit: periodDebit,
    period_credit: periodCredit,
    closing_debit: closingDebit,
    closing_credit: closingCredit,
  })
}

function moneyRow(
  rowNumber: number,
  source: 'bank' | 'cash',
  direction: 'thu' | 'chi',
  amount: number,
  partnerCode: string | null,
  partnerName: string,
): ParsedStagingRow {
  return stagingRow(rowNumber, {
    txn_date: `2026-04-${String(rowNumber).padStart(2, '0')}`,
    direction,
    amount,
    content: `${source} ${direction} ${rowNumber}`,
    partner_code: partnerCode,
    partner_name: partnerName,
    tax_code: null,
    source,
  })
}

describe('luồng kế toán nguyên tử từ dữ liệu rỗng', () => {
  it('tự cho số: đầu kỳ, 10 bán, 12 mua, 10 ngân hàng và 3 tiền mặt đều tự chảy đúng', async () => {
    const db = new PGlite()
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
    const userId = await scalar<string>(
      db,
      `insert into users(auth_id,full_name,email,role,is_active)
       values ($1,'Admin flow test','admin-flow@kbit.test','admin',true) returning id`,
      [authId],
    )

    // Điểm chặn 1: chỉ có số dư đầu kỳ thì cuối kỳ phải bằng đầu kỳ.
    const opening = await createCompanyAndBatch(db, userId, 'FLOW-OPENING')
    const openingFiles: ParsedAccountingFile[] = [
      accountingFile('sales_listing', [], '-opening'),
      accountingFile('sales_journal', [], '-opening'),
      accountingFile('purchase_listing', [], '-opening'),
      accountingFile('purchase_journal', [], '-opening'),
      accountingFile('inventory', [
        stagingRow(1, {
          product_code: 'SP-OPENING-01',
          product_name: 'Sản phẩm đầu kỳ',
          unit: 'cái',
          opening_quantity: 10,
          opening_value: 200,
          receipt_quantity: 0,
          receipt_value: 0,
          issue_quantity: 0,
          issue_value: 0,
          closing_quantity: 10,
          closing_value: 200,
          average_cost: 20,
          account_code: '1561',
        }),
      ], '-opening'),
      accountingFile('receivable_opening', [
        debtRow(1, 'customer', 'KH-OPENING-01', 'Khách đầu kỳ', 300, 0, 0, 0, 300, 0),
      ], '-opening'),
      accountingFile('payable_opening', [
        debtRow(1, 'supplier', 'NCC-OPENING-01', 'NCC đầu kỳ', 0, 400, 0, 0, 0, 400),
      ], '-opening'),
    ]
    expect(buildImportPreview(openingFiles).readyToApprove).toBe(true)
    await stageFiles(db, opening.batchId, openingFiles)
    await db.query(`select kbit_post_import_batch($1)`, [opening.batchId])

    expect(Number(await scalar<string>(
      db,
      `select qty_on_hand from warehouse_stock where warehouse_id=$1`,
      [opening.warehouseId],
    ))).toBe(10)
    expect(Number(await scalar<string>(
      db,
      `select qty*unit_cost
         from warehouse_transactions
        where import_batch_id=$1 and txn_type='opening'`,
      [opening.batchId],
    ))).toBe(200)
    expect(await db.query<{ qty_on_hand: string; avg_cost: string }>(
      `select pmc.qty_on_hand,pmc.avg_cost
         from product_moving_cost pmc
         join products p on p.id=pmc.product_id
        where pmc.company_id=$1 and p.code='SP-OPENING-01'`,
      [opening.companyId],
    )).toMatchObject({
      rows: [{ qty_on_hand: '10.000', avg_cost: '20.00000000' }],
    })
    expect(await db.query<{ partner_type: string; debit_amount: string; credit_amount: string }>(
      `select partner_type,debit_amount,credit_amount
         from debt_opening_balances where import_batch_id=$1 order by partner_type`,
      [opening.batchId],
    )).toMatchObject({
      rows: [
        { partner_type: 'customer', debit_amount: '300.00', credit_amount: '0.00' },
        { partner_type: 'supplier', debit_amount: '0.00', credit_amount: '400.00' },
      ],
    })
    expect(Number(await scalar<string>(
      db,
      `select count(*) from customer_orders where import_batch_id=$1`,
      [opening.batchId],
    ))).toBe(0)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from supplier_orders where import_batch_id=$1`,
      [opening.batchId],
    ))).toBe(0)

    // Điểm chặn 2: nhập lần lượt vào vùng chờ, chưa ghi sổ thì các bảng nghiệp vụ vẫn rỗng.
    const flow = await createCompanyAndBatch(db, userId, 'FLOW-FULL')
    const productCode = 'Sp-Flow-Exact-01'
    const inventoryFile = accountingFile('inventory', [
      stagingRow(1, {
        product_code: productCode,
        product_name: 'Sản phẩm kiểm thử luồng',
        unit: 'cái',
        opening_quantity: 100,
        opening_value: 1_000,
        receipt_quantity: 110,
        receipt_value: 3_200,
        issue_quantity: 45,
        // Cố ý dùng giá vốn tham chiếu khác để chứng minh app tự tính, không khóa số nguồn.
        issue_value: 765,
        closing_quantity: 165,
        closing_value: 3_435,
        average_cost: 3_435 / 165,
        account_code: '1561',
      }),
    ])
    const receivableFile = accountingFile('receivable_opening', [
      debtRow(1, 'customer', 'KH-FLOW-01', 'Khách hàng A', 500, 0, 1_500, 600, 1_400, 0),
      debtRow(2, 'customer', 'KH-FLOW-02', 'Khách hàng B', 0, 0, 4_000, 1_000, 3_000, 0),
    ])
    const payableFile = accountingFile('payable_opening', [
      debtRow(1, 'supplier', 'NCC-FLOW-01', 'Nhà cung cấp A', 0, 700, 550, 4_300, 0, 4_450),
      debtRow(2, 'supplier', 'NCC-FLOW-02', 'Nhà cung cấp B', 0, 300, 700, 5_700, 0, 5_300),
    ])

    const salesDates = [
      '2026-01-10', '2026-01-20', '2026-02-10', '2026-03-04', '2026-03-05',
      '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10',
    ]
    const salesAmounts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000]
    const salesListing = accountingFile(
      'sales_listing',
      salesAmounts.map((amount, index) => listingRow(
        index + 1,
        'BR',
        salesDates[index],
        amount,
        index < 5 ? 'KH-FLOW-01' : 'KH-FLOW-02',
        index < 5 ? 'Khách hàng A' : 'Khách hàng B',
      )),
    )
    const salesJournal = accountingFile('sales_journal', [
      journalRow(1, 'BR', salesDates[0], productCode, 10, 100),
      journalRow(2, 'BR', salesDates[1], productCode, 20, 200),
      journalRow(3, 'BR', salesDates[2], productCode, 15, 300),
    ])

    const purchaseDates = [
      '2026-01-05', '2026-01-20', '2026-02-01', '2026-02-10', '2026-03-05',
      '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10',
      '2026-03-11', '2026-03-12',
    ]
    const purchaseAmounts = [1_000, 900, 800, 500, 500, 600, 700, 800, 900, 1_000, 1_100, 1_200]
    const purchaseListing = accountingFile(
      'purchase_listing',
      purchaseAmounts.map((amount, index) => listingRow(
        index + 1,
        'MV',
        purchaseDates[index],
        amount,
        index < 6 ? 'NCC-FLOW-01' : 'NCC-FLOW-02',
        index < 6 ? 'Nhà cung cấp A' : 'Nhà cung cấp B',
        index < 4 ? 'goods' : 'service',
      )),
    )
    const purchaseJournal = accountingFile('purchase_journal', [
      journalRow(1, 'MV', purchaseDates[0], productCode, 50, 1_000),
      journalRow(2, 'MV', purchaseDates[1], productCode, 30, 900),
      journalRow(3, 'MV', purchaseDates[2], productCode, 20, 800),
      journalRow(4, 'MV', purchaseDates[3], productCode, 10, 500),
    ])

    const bankFile = accountingFile('bank', [
      moneyRow(1, 'bank', 'thu', 300, 'KH-FLOW-01', 'Khách hàng A'),
      moneyRow(2, 'bank', 'thu', 200, 'KH-FLOW-01', 'Khách hàng A'),
      moneyRow(3, 'bank', 'thu', 700, 'KH-FLOW-02', 'Khách hàng B'),
      moneyRow(4, 'bank', 'thu', 300, 'KH-FLOW-02', 'Khách hàng B'),
      moneyRow(5, 'bank', 'chi', 400, 'NCC-FLOW-01', 'Nhà cung cấp A'),
      moneyRow(6, 'bank', 'chi', 100, 'NCC-FLOW-01', 'Nhà cung cấp A'),
      moneyRow(7, 'bank', 'chi', 500, 'NCC-FLOW-02', 'Nhà cung cấp B'),
      moneyRow(8, 'bank', 'chi', 200, 'NCC-FLOW-02', 'Nhà cung cấp B'),
      moneyRow(9, 'bank', 'thu', 50, null, 'Thu khác không qua công nợ'),
      moneyRow(10, 'bank', 'chi', 30, null, 'Chi khác không qua công nợ'),
    ])
    const cashFile = accountingFile('cash', [
      moneyRow(11, 'cash', 'thu', 100, 'KH-FLOW-01', 'Khách hàng A'),
      moneyRow(12, 'cash', 'chi', 50, 'NCC-FLOW-01', 'Nhà cung cấp A'),
      moneyRow(13, 'cash', 'chi', 20, null, 'Chi tiền mặt khác'),
    ])

    const phases = [
      [inventoryFile, receivableFile, payableFile],
      [salesListing, salesJournal],
      [purchaseListing, purchaseJournal],
      [bankFile, cashFile],
    ]
    const accumulated: ParsedAccountingFile[] = []
    const stagedRowCounts = [5, 18, 34, 47]
    for (let index = 0; index < phases.length; index++) {
      accumulated.push(...phases[index])
      const preview = buildImportPreview(accumulated)
      expect(preview.readyToApprove).toBe(index === phases.length - 1)
      await stageFiles(db, flow.batchId, phases[index])
      expect(Number(await scalar<string>(
        db,
        `select count(*) from import_staging_rows where batch_id=$1`,
        [flow.batchId],
      ))).toBe(stagedRowCounts[index])
      expect(Number(await scalar<string>(
        db,
        `select count(*) from customer_orders where import_batch_id=$1`,
        [flow.batchId],
      ))).toBe(0)
      expect(Number(await scalar<string>(
        db,
        `select count(*) from supplier_orders where import_batch_id=$1`,
        [flow.batchId],
      ))).toBe(0)
      expect(Number(await scalar<string>(
        db,
        `select count(*) from warehouse_transactions where import_batch_id=$1`,
        [flow.batchId],
      ))).toBe(0)
    }

    const finalPreview = buildImportPreview(accumulated)
    expect(finalPreview.readyToApprove).toBe(true)
    expect(finalPreview.checks.filter((check) => check.status === 'failed')).toEqual([])
    await db.query(`select kbit_post_import_batch($1)`, [flow.batchId])

    // Bảng kê có đủ 10/12 hóa đơn; nhật ký chỉ có đúng 3/4 hóa đơn tồn kho.
    expect(Number(await scalar<string>(
      db,
      `select count(*) from customer_orders where import_batch_id=$1`,
      [flow.batchId],
    ))).toBe(10)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from supplier_orders where import_batch_id=$1`,
      [flow.batchId],
    ))).toBe(12)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from customer_order_items coi
        join customer_orders co on co.id=coi.order_id
       where co.import_batch_id=$1 and coi.product_id is not null`,
      [flow.batchId],
    ))).toBe(3)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from supplier_order_items soi
        join supplier_orders so on so.id=soi.order_id
       where so.import_batch_id=$1 and soi.product_id is not null`,
      [flow.batchId],
    ))).toBe(4)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from warehouse_transactions
        where import_batch_id=$1 and txn_type='order_deduction'`,
      [flow.batchId],
    ))).toBe(3)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from warehouse_transactions
        where import_batch_id=$1 and txn_type='receipt'`,
      [flow.batchId],
    ))).toBe(4)

    // NXT: đầu kỳ + nhật ký mua - nhật ký bán; mã giữ nguyên cả chữ hoa/thường.
    const inventoryFlow = await db.query<{
      txn_type: string
      quantity: string
      value: string
    }>(
      `select txn_type,sum(qty) quantity,sum(qty*unit_cost) value
         from warehouse_transactions
        where import_batch_id=$1
        group by txn_type order by txn_type`,
      [flow.batchId],
    )
    expect(Object.fromEntries(inventoryFlow.rows.map((row) => [
      row.txn_type,
      Number(row.quantity),
    ]))).toEqual({
      opening: 100,
      order_deduction: 45,
      receipt: 110,
    })
    expect(Number(await scalar<string>(
      db,
      `select qty_on_hand from warehouse_stock where warehouse_id=$1`,
      [flow.warehouseId],
    ))).toBe(165)
    expect(await scalar<string>(
      db,
      `select p.code
         from products p
         join warehouse_stock ws on ws.product_id=p.id
        where ws.warehouse_id=$1`,
      [flow.warehouseId],
    )).toBe(productCode)

    // Bình quân liên hoàn, nhập trước xuất nếu cùng ngày.
    const issueCosts = (await db.query<{ txn_date: string; unit_cost: string }>(
      `select txn_date::text,unit_cost
         from warehouse_transactions
        where import_batch_id=$1 and txn_type='order_deduction'
        order by txn_date`,
      [flow.batchId],
    )).rows
    expect(Number(issueCosts[0].unit_cost)).toBeCloseTo(13.33333333, 7)
    expect(Number(issueCosts[1].unit_cost)).toBeCloseTo(16.2745098, 7)
    expect(Number(issueCosts[2].unit_cost)).toBeCloseTo(20.78431373, 7)
    const actualIssueValue = inventoryFlow.rows
      .filter((row) => row.txn_type === 'order_deduction')
      .reduce((sum, row) => sum + Number(row.value), 0)
    expect(actualIssueValue).toBeCloseTo(770.58823525, 5)
    expect(actualIssueValue).not.toBeCloseTo(765, 2)
    const actualClosingValue = 1_000 + 3_200 - actualIssueValue
    expect(actualClosingValue).toBeCloseTo(3_429.41176475, 5)
    expect(actualClosingValue).not.toBeCloseTo(3_435, 2)

    // Công nợ: không có dòng tự bù; phát sinh chỉ lấy từ bảng kê và tiền thực tế.
    expect(Number(await scalar<string>(
      db,
      `select count(*) from debt_adjustments where import_batch_id=$1`,
      [flow.batchId],
    ))).toBe(0)
    const debtFlow = await db.query<{
      ar_debit: string
      ar_credit_bank: string
      ar_credit_cash: string
      ap_debit_bank: string
      ap_debit_cash: string
      ap_credit: string
    }>(
      `select
        (select sum(grand_total) from customer_orders
          where import_batch_id=$1 and creates_receivable) ar_debit,
        (select sum(amount) from income_transactions
          where import_batch_id=$1 and affects_debt) ar_credit_bank,
        (select sum(so_tien) from cash_book
          where import_batch_id=$1 and customer_id is not null and direction='thu') ar_credit_cash,
        (select sum(amount_vnd) from expense_transactions
          where import_batch_id=$1 and affects_debt) ap_debit_bank,
        (select sum(so_tien) from cash_book
          where import_batch_id=$1 and supplier_id is not null and direction='chi') ap_debit_cash,
        (select sum(payable_total) from supplier_orders
          where import_batch_id=$1 and creates_payable) ap_credit`,
      [flow.batchId],
    )
    expect(debtFlow.rows[0]).toMatchObject({
      ar_debit: '5500.00',
      ar_credit_bank: '1500.00',
      ar_credit_cash: '100.00',
      ap_debit_bank: '1200.00',
      ap_debit_cash: '50.00',
      ap_credit: '10000.00',
    })
    const customerClosing = (await db.query<{ code: string; closing_debit: string }>(
      `select c.code,
              d.debit_amount-d.credit_amount
              + coalesce((select sum(co.grand_total) from customer_orders co
                           where co.import_batch_id=$1 and co.customer_id=c.id
                             and co.creates_receivable),0)
              - coalesce((select sum(i.amount) from income_transactions i
                           where i.import_batch_id=$1 and i.customer_id=c.id
                             and i.affects_debt),0)
              - coalesce((select sum(cb.so_tien) from cash_book cb
                           where cb.import_batch_id=$1 and cb.customer_id=c.id
                             and cb.direction='thu'),0) closing_debit
         from debt_opening_balances d
         join customers c on c.id=d.partner_id
        where d.import_batch_id=$1 and d.partner_type='customer'
        order by c.code`,
      [flow.batchId],
    )).rows.map((row) => ({ code: row.code, closing: Number(row.closing_debit) }))
    const supplierClosing = (await db.query<{ code: string; closing_credit: string }>(
      `select s.code,
              d.credit_amount-d.debit_amount
              + coalesce((select sum(so.payable_total) from supplier_orders so
                           where so.import_batch_id=$1 and so.supplier_id=s.id
                             and so.creates_payable),0)
              - coalesce((select sum(e.amount_vnd) from expense_transactions e
                           where e.import_batch_id=$1 and e.supplier_id=s.id
                             and e.affects_debt),0)
              - coalesce((select sum(cb.so_tien) from cash_book cb
                           where cb.import_batch_id=$1 and cb.supplier_id=s.id
                             and cb.direction='chi'),0) closing_credit
         from debt_opening_balances d
         join suppliers s on s.id=d.partner_id
        where d.import_batch_id=$1 and d.partner_type='supplier'
        order by s.code`,
      [flow.batchId],
    )).rows.map((row) => ({ code: row.code, closing: Number(row.closing_credit) }))
    expect(customerClosing).toEqual([
      { code: 'KH-FLOW-01', closing: 1_400 },
      { code: 'KH-FLOW-02', closing: 3_000 },
    ])
    expect(supplierClosing).toEqual([
      { code: 'NCC-FLOW-01', closing: 4_450 },
      { code: 'NCC-FLOW-02', closing: 5_300 },
    ])
    expect(Number(await scalar<string>(
      db,
      `select count(*) from income_transactions where import_batch_id=$1`,
      [flow.batchId],
    ))).toBe(5)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from expense_transactions where import_batch_id=$1`,
      [flow.batchId],
    ))).toBe(5)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from cash_book where import_batch_id=$1`,
      [flow.batchId],
    ))).toBe(3)
    expect(Number(await scalar<string>(
      db,
      `select
         (select count(*) from income_transactions
           where import_batch_id=$1 and not affects_debt)
         + (select count(*) from expense_transactions
           where import_batch_id=$1 and not affects_debt)`,
      [flow.batchId],
    ))).toBe(2)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from cash_book
        where import_batch_id=$1 and customer_id is null and supplier_id is null`,
      [flow.batchId],
    ))).toBe(1)

    // Mã công nợ của bài test được giữ nguyên, không sinh thêm mã giả.
    const customerCodes = (await db.query<{ code: string }>(
      `select distinct c.code
         from customers c join customer_orders co on co.customer_id=c.id
        where co.import_batch_id=$1 order by c.code`,
      [flow.batchId],
    )).rows.map((row) => row.code)
    const supplierCodes = (await db.query<{ code: string }>(
      `select distinct s.code
         from suppliers s join supplier_orders so on so.supplier_id=s.id
        where so.import_batch_id=$1 order by s.code`,
      [flow.batchId],
    )).rows.map((row) => row.code)
    expect(customerCodes).toEqual(['KH-FLOW-01', 'KH-FLOW-02'])
    expect(supplierCodes).toEqual(['NCC-FLOW-01', 'NCC-FLOW-02'])
    expect(Number(await scalar<string>(
      db,
      `select count(*) from import_staging_rows
        where batch_id=$1 and mapping_status='created' and target_id is not null`,
      [flow.batchId],
    ))).toBe(47)

    const postingChecks = await db.query<{ check_code: string; status: string }>(
      `select check_code,status from import_checks
        where batch_id=$1 and check_code like 'POST_%' order by check_code`,
      [flow.batchId],
    )
    expect(postingChecks.rows.filter((row) => row.status === 'failed')).toEqual([])
  }, 180_000)
})
