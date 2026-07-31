import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildImportPreview, parseAccountingWorkbook } from './parser'

const sourceFolder = resolve(process.cwd(), '..', 'GLA_6 THANG DAU NAM 2026')
const files = [
  '0315226378_Bang Ke BR Tu Thang 1 Den Thang 6.xls',
  '0315226378_Bang Ke Mua Vao Tu Thang 1 Den Thang 12.xls',
  '0315226378_Tong Hop - Chi Tiet CNo Phai Thu Tu Thang 1 Den Thang 6.xlsx',
  '0315226378_Tong Hop - Chi Tiet CNo Phai Tra Tu Thang 1 Den Thang 6.xlsx',
  'Bang Nhap Xuat Ton Tu Thang 1 Den Thang 6.xlsx',
  'NHAT KY BAN.xlsx',
  'NHAT KY MUA.xlsx',
  'SPNH_GLA.xlsx',
]

describe('bộ file thật GLA 6 tháng đầu năm 2026', () => {
  it('đọc đủ dòng nguồn và vượt cổng đối chiếu', () => {
    const parsed = files.map((filename) => {
      const bytes = readFileSync(resolve(sourceFolder, filename))
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      return parseAccountingWorkbook(bytes, filename, sha256)
    })
    const counts = Object.fromEntries(parsed.map((file) => [
      file.kind,
      file.rows.filter((row) => row.normalized.record_type !== 'detail').length,
    ]))
    expect(counts).toMatchObject({
      sales_listing: 19,
      sales_journal: 120,
      purchase_listing: 49,
      purchase_journal: 37,
      inventory: 85,
      receivable_opening: 7,
      payable_opening: 17,
      bank: 48,
    })

    const preview = buildImportPreview(parsed)
    expect(
      preview.checks.filter((check) => check.status === 'failed'),
      'Các kiểm tra GLA bắt buộc phải khớp hoặc được giải thích cụ thể',
    ).toEqual([])
    expect(preview.readyToApprove).toBe(true)

    const debtAffectingListings = parsed
      .filter((file) => file.kind === 'sales_listing' || file.kind === 'purchase_listing')
      .flatMap((file) => file.rows)
      .filter((row) => row.normalized.affects_debt === true)
    const sourceDebtCodes = new Set(
      parsed
        .filter((file) => file.kind === 'receivable_opening' || file.kind === 'payable_opening')
        .flatMap((file) => file.rows)
        .filter((row) => row.normalized.record_type === 'summary')
        .map((row) => String(row.normalized.partner_code)),
    )
    expect(debtAffectingListings.every((row) => Boolean(row.normalized.partner_code))).toBe(true)
    expect(debtAffectingListings.every(
      (row) => sourceDebtCodes.has(String(row.normalized.partner_code)),
    )).toBe(true)

    const bankRows = parsed.find((file) => file.kind === 'bank')!.rows
    expect(bankRows.filter((row) => row.normalized.affects_debt === true)).toHaveLength(28)
    expect(bankRows
      .filter((row) => row.normalized.affects_debt === true)
      .every((row) => /^(131|331)-/.test(String(row.normalized.partner_code)))).toBe(true)
  })
})
