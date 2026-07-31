import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { buildImportPreview, parseAccountingWorkbook } from './parser'
import { buildInvoiceKey } from './reconcile'

const sourceFolder = path.resolve(process.cwd(), '..', 'GLA_6 THANG DAU NAM 2026')
const migrationDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
)
const authId = '00000000-0000-0000-0000-000000000099'
const patchMigration = (sql: string) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, '-- skipped in PGlite')

async function scalar<T = string>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<Record<string, T>>(sql, params)
  return Object.values(result.rows[0])[0]
}

describe.skipIf(!existsSync(sourceFolder))('ghi sổ bộ file thật GLA', () => {
  it('ghi đủ bảng kê, đúng tập con nhật ký và cân số lượng tồn kho', async () => {
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
       values ($1,'Admin GLA test','admin-gla@kbit.test','admin',true) returning id`,
      [authId],
    )
    const companyId = await scalar<string>(
      db,
      `insert into companies(code,name,country,base_currency)
       values ('GLA-POST-TEST','GLA posting test','VN','VND') returning id`,
    )
    const warehouseId = await scalar<string>(
      db,
      `insert into warehouses(company_id,code,name,is_default)
       values ($1,'GLA-KHO','Kho GLA',true) returning id`,
      [companyId],
    )
    const batchId = await scalar<string>(
      db,
      `insert into import_batches(
         company_id,period_from,period_to,source_label,status,created_by
       ) values ($1,'2026-01-01','2026-06-30','GLA 6 tháng đầu năm 2026','approved',$2)
       returning id`,
      [companyId, userId],
    )

    const filenames = readdirSync(sourceFolder)
      .filter((name) => /\.(xlsx?|xlsm|csv)$/i.test(name))
      .sort()
    const parsedFiles = filenames.map((filename) => {
      const bytes = readFileSync(path.join(sourceFolder, filename))
      return parseAccountingWorkbook(
        bytes,
        filename,
        createHash('sha256').update(bytes).digest('hex'),
      )
    })
    // Nhập từng phần như quy trình thực tế. Mỗi phần chỉ vào vùng chờ;
    // sổ chính phải còn rỗng cho tới khi đủ bộ và được ghi sổ nguyên tử.
    const phaseKinds = [
      ['inventory', 'receivable_opening', 'payable_opening'],
      ['sales_listing', 'sales_journal'],
      ['purchase_listing', 'purchase_journal'],
      ['bank', 'cash'],
    ] as const
    const accumulatedFiles: typeof parsedFiles = []
    let expectedStagingRows = 0

    for (let phaseIndex = 0; phaseIndex < phaseKinds.length; phaseIndex++) {
      const phaseFiles = parsedFiles.filter(
        (file) => phaseKinds[phaseIndex].includes(file.kind as never),
      )
      accumulatedFiles.push(...phaseFiles)
      expectedStagingRows += phaseFiles.reduce((sum, file) => sum + file.rows.length, 0)
      const phasePreview = buildImportPreview(accumulatedFiles)
      expect(phasePreview.readyToApprove).toBe(phaseIndex === phaseKinds.length - 1)

      for (const file of phaseFiles) {
        const fileId = await scalar<string>(
          db,
          `insert into import_files(batch_id,kind,filename,sha256,sheet_name,row_count)
           values ($1,$2,$3,$4,$5,$6) returning id`,
          [batchId, file.kind, file.filename, file.sha256, file.sheetName, file.rows.length],
        )
        for (const row of file.rows) {
          const invoiceNo = String(row.normalized.invoice_no ?? '').trim()
          const invoiceDate = String(
            row.normalized.posting_invoice_date
            ?? row.normalized.invoice_date
            ?? '',
          ).trim()
          const reconciliationKey = invoiceNo && invoiceDate
            ? buildInvoiceKey({ invoiceNo, invoiceDate })
            : String(
                row.normalized.product_code
                ?? row.normalized.partner_code
                ?? '',
              ) || null
          await db.query(
            `insert into import_staging_rows(
               batch_id,file_id,row_number,row_kind,reconciliation_key,raw_data,normalized_data
             ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
            [
              batchId,
              fileId,
              row.rowNumber,
              file.kind,
              reconciliationKey,
              JSON.stringify(row.raw),
              JSON.stringify(row.normalized),
            ],
          )
        }
      }

      expect(Number(await scalar<string>(
        db,
        `select count(*) from import_staging_rows where batch_id=$1`,
        [batchId],
      ))).toBe(expectedStagingRows)
      expect(Number(await scalar<string>(
        db,
        `select count(*) from customer_orders where import_batch_id=$1`,
        [batchId],
      ))).toBe(0)
      expect(Number(await scalar<string>(
        db,
        `select count(*) from supplier_orders where import_batch_id=$1`,
        [batchId],
      ))).toBe(0)
      expect(Number(await scalar<string>(
        db,
        `select count(*) from warehouse_transactions where import_batch_id=$1`,
        [batchId],
      ))).toBe(0)
    }

    const preview = buildImportPreview(accumulatedFiles)
    expect(preview.readyToApprove).toBe(true)

    await db.query(`select kbit_post_import_batch($1)`, [batchId])

    expect(await scalar<string>(db, `select status from import_batches where id=$1`, [batchId])).toBe('posted')
    expect(Number(await scalar<string>(
      db,
      `select count(*) from customer_orders where import_batch_id=$1`,
      [batchId],
    ))).toBe(19)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from supplier_orders where import_batch_id=$1`,
      [batchId],
    ))).toBe(49)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from customer_order_items coi
        join customer_orders co on co.id=coi.order_id
       where co.import_batch_id=$1 and coi.product_id is not null`,
      [batchId],
    ))).toBe(120)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from supplier_order_items soi
        join supplier_orders so on so.id=soi.order_id
       where so.import_batch_id=$1 and soi.product_id is not null`,
      [batchId],
    ))).toBe(37)
    expect(Number(await scalar<string>(
      db,
      `select count(*) from debt_adjustments where import_batch_id=$1`,
      [batchId],
    ))).toBe(0)

    const sourceCustomerCodes = parsedFiles
      .find((file) => file.kind === 'receivable_opening')!
      .rows
      .filter((row) => row.normalized.record_type === 'summary')
      .map((row) => String(row.normalized.partner_code))
      .sort()
    const sourceSupplierCodes = parsedFiles
      .find((file) => file.kind === 'payable_opening')!
      .rows
      .filter((row) => row.normalized.record_type === 'summary')
      .map((row) => String(row.normalized.partner_code))
      .sort()
    const postedCustomerCodes = (await db.query<{ code: string }>(
      `select distinct c.code
         from customers c
         join customer_orders co on co.customer_id=c.id
        where co.import_batch_id=$1
        order by c.code`,
      [batchId],
    )).rows.map((row) => row.code)
    const postedSupplierCodes = (await db.query<{ code: string }>(
      `select distinct s.code
         from suppliers s
         join supplier_orders so on so.supplier_id=s.id
        where so.import_batch_id=$1
        order by s.code`,
      [batchId],
    )).rows.map((row) => row.code)
    expect(postedCustomerCodes.every((code) => sourceCustomerCodes.includes(code))).toBe(true)
    expect(postedSupplierCodes.every((code) => sourceSupplierCodes.includes(code))).toBe(true)
    const openingCustomerCodes = (await db.query<{ code: string }>(
      `select c.code
         from debt_opening_balances d
         join customers c on c.id=d.partner_id
        where d.import_batch_id=$1 and d.partner_type='customer'
        order by c.code`,
      [batchId],
    )).rows.map((row) => row.code)
    const openingSupplierCodes = (await db.query<{ code: string }>(
      `select s.code
         from debt_opening_balances d
         join suppliers s on s.id=d.partner_id
        where d.import_batch_id=$1 and d.partner_type='supplier'
        order by s.code`,
      [batchId],
    )).rows.map((row) => row.code)
    expect(openingCustomerCodes).toEqual(sourceCustomerCodes)
    expect(openingSupplierCodes).toEqual(sourceSupplierCodes)

    const inventoryRows = parsedFiles.find((file) => file.kind === 'inventory')!.rows
    const sourceProductCodes = inventoryRows
      .map((row) => String(row.normalized.product_code))
      .sort()
    const postedProductCodes = (await db.query<{ code: string }>(
      `select distinct p.code
         from products p
         join warehouse_transactions wt on wt.product_id=p.id
        where wt.import_batch_id=$1
        order by p.code`,
      [batchId],
    )).rows.map((row) => row.code)
    expect(postedProductCodes).toEqual(sourceProductCodes)

    const sourceClosingQuantity = inventoryRows
      .reduce((sum, row) => sum + Number(row.normalized.closing_quantity ?? 0), 0)
    const appClosingQuantity = Number(await scalar<string>(
      db,
      `select coalesce(sum(ws.qty_on_hand),0)
         from warehouse_stock ws
        where ws.warehouse_id=$1`,
      [warehouseId],
    ))
    expect(appClosingQuantity).toBeCloseTo(sourceClosingQuantity, 2)
    const perProductFlow = new Map(
      (await db.query<{
        code: string
        opening_quantity: string
        receipt_quantity: string
        issue_quantity: string
        closing_quantity: string
      }>(
        `select p.code,
                coalesce(sum(case when wt.txn_type='opening' then wt.qty else 0 end),0) opening_quantity,
                coalesce(sum(case when wt.txn_type='receipt' then wt.qty else 0 end),0) receipt_quantity,
                coalesce(sum(case when wt.txn_type='order_deduction' then wt.qty else 0 end),0) issue_quantity,
                max(ws.qty_on_hand) closing_quantity
           from warehouse_transactions wt
           join products p on p.id=wt.product_id
           join warehouse_stock ws
             on ws.product_id=wt.product_id and ws.warehouse_id=wt.warehouse_id
          where wt.import_batch_id=$1
          group by p.code
          order by p.code`,
        [batchId],
      )).rows.map((row) => [row.code, row]),
    )
    expect(perProductFlow.size).toBe(inventoryRows.length)
    for (const sourceRow of inventoryRows) {
      const code = String(sourceRow.normalized.product_code)
      const posted = perProductFlow.get(code)
      expect(posted, `Thiếu dòng NXT cho mã ${code}`).toBeDefined()
      expect(Number(posted!.opening_quantity)).toBeCloseTo(
        Number(sourceRow.normalized.opening_quantity ?? 0),
        3,
      )
      expect(Number(posted!.receipt_quantity)).toBeCloseTo(
        Number(sourceRow.normalized.receipt_quantity ?? 0),
        3,
      )
      expect(Number(posted!.issue_quantity)).toBeCloseTo(
        Number(sourceRow.normalized.issue_quantity ?? 0),
        3,
      )
      expect(Number(posted!.closing_quantity)).toBeCloseTo(
        Number(sourceRow.normalized.closing_quantity ?? 0),
        3,
      )
    }

    const sourceValues = {
      opening: inventoryRows.reduce((sum, row) => sum + Number(row.normalized.opening_value ?? 0), 0),
      receipt: inventoryRows.reduce((sum, row) => sum + Number(row.normalized.receipt_value ?? 0), 0),
      issue: inventoryRows.reduce((sum, row) => sum + Number(row.normalized.issue_value ?? 0), 0),
      closing: inventoryRows.reduce((sum, row) => sum + Number(row.normalized.closing_value ?? 0), 0),
    }
    const appValuesResult = await db.query<{
      opening: string
      receipt: string
      issue: string
    }>(
      `select
         coalesce(sum(case when txn_type='opening' then qty*unit_cost else 0 end),0) opening,
         coalesce(sum(case when txn_type='receipt' then qty*unit_cost else 0 end),0) receipt,
         coalesce(sum(case when txn_type='order_deduction' then qty*unit_cost else 0 end),0) issue
       from warehouse_transactions where import_batch_id=$1`,
      [batchId],
    )
    const appValues = {
      opening: Number(appValuesResult.rows[0].opening),
      receipt: Number(appValuesResult.rows[0].receipt),
      issue: Number(appValuesResult.rows[0].issue),
    }
    const capitalizableImportExtra = Number(await scalar<string>(
      db,
      `select coalesce(sum(icc.amount_vnd),0)
         from import_cost_components icc
         join supplier_orders so on so.id=icc.supplier_order_id
        where so.import_batch_id=$1
          and icc.capitalizable
          and icc.kind <> 'goods'`,
      [batchId],
    ))
    const importCostAllocation = await db.query<{
      order_type: string
      purchase_nature: string
      goods_value: string
      landed_cost_vnd: string
      source_line_value: string
      allocated_line_value: string
    }>(
      `select so.order_type,so.purchase_nature,so.goods_value,so.landed_cost_vnd,
              coalesce(sum(soi.source_line_amount),0) source_line_value,
              coalesce(sum(soi.qty*soi.unit_cost),0) allocated_line_value
         from supplier_orders so
         join supplier_order_items soi on soi.order_id=so.id
        where so.import_batch_id=$1
          and so.order_type='import'
        group by so.id,so.order_type,so.purchase_nature,so.goods_value,so.landed_cost_vnd`,
      [batchId],
    )
    expect(importCostAllocation.rows).toEqual([
      expect.objectContaining({ purchase_nature: 'goods' }),
    ])
    expect(Number(importCostAllocation.rows[0].allocated_line_value))
      .toBeCloseTo(Number(importCostAllocation.rows[0].landed_cost_vnd), 2)
    expect(Number(importCostAllocation.rows[0].source_line_value))
      .toBeCloseTo(Number(importCostAllocation.rows[0].landed_cost_vnd), 2)
    expect(appValues.opening).toBeCloseTo(sourceValues.opening, 2)
    expect(capitalizableImportExtra).toBe(21_037_760)
    expect(appValues.receipt).toBeCloseTo(sourceValues.receipt, 2)
    expect(appValues.issue).not.toBeCloseTo(sourceValues.issue, 2)

    const naturalDebt = await db.query<{
      ar_debit: string
      ar_credit: string
      ap_debit: string
      ap_credit: string
    }>(
      `select
        (select coalesce(sum(grand_total),0) from customer_orders
          where import_batch_id=$1 and creates_receivable) ar_debit,
        (select coalesce(sum(amount),0) from income_transactions
          where import_batch_id=$1 and affects_debt) ar_credit,
        (select coalesce(sum(amount_vnd),0) from expense_transactions
          where import_batch_id=$1 and affects_debt) ap_debit,
        (select coalesce(sum(payable_total),0) from supplier_orders
          where import_batch_id=$1 and creates_payable) ap_credit`,
      [batchId],
    )
    const debtSummaryRows = parsedFiles
      .filter((file) => file.kind === 'receivable_opening' || file.kind === 'payable_opening')
      .flatMap((file) => file.rows)
      .filter((row) => row.normalized.record_type === 'summary')
    const expectedDebt = {
      arDebit: debtSummaryRows
        .filter((row) => row.normalized.partner_type === 'customer')
        .reduce((sum, row) => sum + Number(row.normalized.period_debit ?? 0), 0),
      arCredit: debtSummaryRows
        .filter((row) => row.normalized.partner_type === 'customer')
        .reduce((sum, row) => sum + Number(row.normalized.period_credit ?? 0), 0),
      apDebit: debtSummaryRows
        .filter((row) => row.normalized.partner_type === 'supplier')
        .reduce((sum, row) => sum + Number(row.normalized.period_debit ?? 0), 0),
      apCredit: debtSummaryRows
        .filter((row) => row.normalized.partner_type === 'supplier')
        .reduce((sum, row) => sum + Number(row.normalized.period_credit ?? 0), 0),
    }
    expect(Number(naturalDebt.rows[0].ar_debit)).toBeCloseTo(expectedDebt.arDebit, 2)
    expect(Number(naturalDebt.rows[0].ar_credit)).toBeCloseTo(expectedDebt.arCredit, 2)
    expect(Number(naturalDebt.rows[0].ap_debit)).toBeCloseTo(expectedDebt.apDebit, 2)
    expect(Number(naturalDebt.rows[0].ap_credit)).toBeCloseTo(expectedDebt.apCredit, 2)

    const sourceBankRows = parsedFiles
      .filter((file) => file.kind === 'bank')
      .flatMap((file) => file.rows)
    const postedBankRows = Number(await scalar<string>(
      db,
      `select
         (select count(*) from income_transactions where import_batch_id=$1)
         + (select count(*) from expense_transactions where import_batch_id=$1)`,
      [batchId],
    ))
    const postedDebtBankRows = Number(await scalar<string>(
      db,
      `select
         (select count(*) from income_transactions
           where import_batch_id=$1 and affects_debt)
         + (select count(*) from expense_transactions
           where import_batch_id=$1 and affects_debt)`,
      [batchId],
    ))
    expect(postedBankRows).toBe(sourceBankRows.length)
    expect(postedDebtBankRows).toBe(
      sourceBankRows.filter((row) => row.normalized.affects_debt === true).length,
    )

    const quantityChecks = await db.query<{ check_code: string; status: string }>(
      `select check_code,status
         from import_checks
        where batch_id=$1 and check_code like 'POST_NXT_%_QTY'
        order by check_code`,
      [batchId],
    )
    expect(quantityChecks.rows).toEqual([
      { check_code: 'POST_NXT_CLOSING_QTY', status: 'passed' },
      { check_code: 'POST_NXT_ISSUE_QTY', status: 'passed' },
      { check_code: 'POST_NXT_OPENING_QTY', status: 'passed' },
      { check_code: 'POST_NXT_RECEIPT_QTY', status: 'passed' },
    ])

    await db.query(`select kbit_rollback_import_batch($1)`, [batchId])
    expect(await scalar<string>(db, `select status from import_batches where id=$1`, [batchId])).toBe('rolled_back')
  }, 180_000)
})
