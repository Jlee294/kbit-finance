import { describe, expect, it } from 'vitest'
import { buildImportPreview, detectAccountingFileKind, parseSheetRows } from './parser'

describe('detectAccountingFileKind', () => {
  it('nhận diện bộ tên file kiểu Quyên gửi mà không phụ thuộc chữ hoa/dấu', () => {
    expect(detectAccountingFileKind('0315_Bảng Kê BR Từ Tháng 1 Đến Tháng 6.xls')).toBe('sales_listing')
    expect(detectAccountingFileKind('NHAT KY MUA.xlsx')).toBe('purchase_journal')
    expect(detectAccountingFileKind('Tổng Hợp CNo Phải Thu.xlsx')).toBe('receivable_opening')
  })
})

describe('parseSheetRows', () => {
  it('đọc bảng kê bán ra theo vị trí tương đối từ cột STT', () => {
    const parsed = parseSheetRows('sales_listing', [
      ['STT', 'Mẫu số', 'Ký hiệu', 'Số HĐ', 'Ngày HĐ', 'Tên người mua', 'MST', 'Nội dung', 'Tiền hàng', 'VAT', 'Ghi chú'],
      [1, '1', 'C26TAA', '000001', '17/01/2026', 'Công ty A', '0101', 'Bán hàng', 1_000_000, 100_000, ''],
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].normalized).toMatchObject({
      invoice_no: '000001',
      invoice_date: '2026-01-17',
      partner_name: 'Công ty A',
      subtotal: 1_000_000,
      vat_amount: 100_000,
    })
  })

  it('đọc nhật ký có mã hàng và ngày Excel', () => {
    const parsed = parseSheetRows('sales_journal', [
      ['Tháng', 'Số HĐ', 'Ngày HĐ', 'Mã HH', 'Tên hàng', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền'],
      [1, '1', 46039, 'MH01', 'Hàng A', 'Cái', 2, 500_000, 1_000_000],
    ])
    expect(parsed[0].normalized).toMatchObject({
      invoice_no: '1',
      invoice_date: '2026-01-17',
      product_code: 'MH01',
      quantity: 2,
    })
  })

  it('không làm mất dòng nhật ký thiếu mã hàng để cổng kiểm tra có thể chặn', () => {
    const parsed = parseSheetRows('sales_journal', [
      ['Tháng', 'Số HĐ', 'Ngày HĐ', 'Mã HH', 'Tên hàng', 'ĐVT', 'SL', 'Đơn giá', 'Thành tiền'],
      [1, '1', 46039, '', 'Hàng chưa có mã', 'Cái', 2, 500_000, 1_000_000],
    ])

    expect(parsed).toHaveLength(1)
    expect(parsed[0].normalized.product_code).toBe('')
  })

  it('xếp phí vận chuyển có số tờ khai vào lô nhập khẩu', () => {
    const parsed = parseSheetRows('purchase_listing', [
      ['STT', 'Mẫu số', 'Ký hiệu', 'Số HĐ', 'Ngày HĐ', 'Tên người bán', 'MST', 'Nội dung', 'Tiền hàng', 'Thuế suất', 'VAT', 'Ghi chú'],
      [1, '1', 'C26TAA', '000002', '18/01/2026', 'Đơn vị vận chuyển', '0102', 'Phí vận chuyển tờ khai 10612345678', 2_000_000, 10, 200_000, ''],
    ])

    expect(parsed[0].normalized).toMatchObject({
      order_type: 'import',
      purchase_nature: 'freight',
      customs_declaration_no: '10612345678',
    })
  })
})

describe('buildImportPreview', () => {
  it('chặn lô nếu công nợ hoặc NXT không cân', () => {
    const preview = buildImportPreview([
      {
        filename: 'NXT.xlsx',
        kind: 'inventory',
        sheetName: 'Sheet1',
        sha256: 'a',
        rows: [{
          rowNumber: 2,
          raw: [],
          normalized: {
            product_code: 'MH01',
            opening_quantity: 10,
            receipt_quantity: 5,
            issue_quantity: 3,
            closing_quantity: 99,
            opening_value: 100,
            receipt_value: 50,
            issue_value: 30,
            closing_value: 120,
          },
        }],
      },
      {
        filename: 'AR.xlsx',
        kind: 'receivable_opening',
        sheetName: 'Sheet1',
        sha256: 'b',
        rows: [{
          rowNumber: 2,
          raw: [],
          normalized: {
            partner_code: 'KH01',
            opening_debit: 10,
            opening_credit: 0,
            period_debit: 5,
            period_credit: 3,
            closing_debit: 99,
            closing_credit: 0,
          },
        }],
      },
    ])
    expect(preview.checks.some((check) => check.code === 'NXT_QTY_MH01' && check.status === 'failed')).toBe(true)
    expect(preview.checks.some((check) => check.code === 'DEBT_AR_KH01' && check.status === 'failed')).toBe(true)
    expect(preview.readyToApprove).toBe(false)
  })

  it('chỉ dùng đúng mã công nợ từ file nguồn và không tạo mã cho quà tặng', () => {
    const salesListing = {
      filename: 'sales.xls',
      kind: 'sales_listing' as const,
      sheetName: 'Sheet1',
      sha256: 'sales',
      rows: [
        {
          rowNumber: 1,
          raw: [],
          normalized: {
            invoice_no: '1',
            invoice_date: '2026-01-17',
            partner_name: 'Công ty A',
            tax_code: '0101',
            subtotal: 1_000_000,
            vat_amount: 100_000,
            grand_total: 1_100_000,
            is_gift: false,
          },
        },
        {
          rowNumber: 2,
          raw: [],
          normalized: {
            invoice_no: '2',
            invoice_date: '2026-01-18',
            partner_name: 'Người nhận quà',
            tax_code: null,
            subtotal: 200_000,
            vat_amount: 20_000,
            grand_total: 220_000,
            is_gift: true,
          },
        },
      ],
    }
    const receivable = {
      filename: 'ar.xlsx',
      kind: 'receivable_opening' as const,
      sheetName: 'CN_TH',
      sha256: 'ar',
      rows: [{
        rowNumber: 1,
        raw: [],
        normalized: {
          record_type: 'summary',
          partner_type: 'customer',
          partner_name: 'CÔNG TY A',
          tax_code: '0101',
          partner_code: '131-01',
          opening_debit: 0,
          opening_credit: 0,
          period_debit: 1_100_000,
          period_credit: 0,
          closing_debit: 1_100_000,
          closing_credit: 0,
        },
      }],
    }

    const preview = buildImportPreview([salesListing, receivable])

    expect(salesListing.rows[0].normalized).toMatchObject({
      affects_debt: true,
      partner_code: '131-01',
    })
    expect(salesListing.rows[1].normalized).toMatchObject({
      affects_debt: false,
      partner_code: null,
    })
    expect(preview.checks).toContainEqual(expect.objectContaining({
      code: 'SALES_SOURCE_PARTNER_CODES',
      status: 'passed',
    }))
  })

  it('chặn hóa đơn công nợ khi không có mã đối tác trong file Quyên', () => {
    const preview = buildImportPreview([{
      filename: 'sales.xls',
      kind: 'sales_listing',
      sheetName: 'Sheet1',
      sha256: 'sales',
      rows: [{
        rowNumber: 1,
        raw: [],
        normalized: {
          invoice_no: '1',
          invoice_date: '2026-01-17',
          partner_name: 'Công ty không có trong công nợ',
          tax_code: '0999',
          subtotal: 1_000_000,
          vat_amount: 100_000,
          grand_total: 1_100_000,
          is_gift: false,
        },
      }],
    }])

    expect(preview.checks).toContainEqual(expect.objectContaining({
      code: 'SALES_SOURCE_PARTNER_CODES',
      status: 'failed',
      actual: 1,
    }))
    expect(preview.readyToApprove).toBe(false)
  })

  it('map SPNH vào đúng mã công nợ bằng ngày và số tiền của chi tiết nguồn', () => {
    const receivable = {
      filename: 'ar.xlsx',
      kind: 'receivable_opening' as const,
      sheetName: 'CN_TH',
      sha256: 'ar',
      rows: [
        {
          rowNumber: 1,
          raw: [],
          normalized: {
            record_type: 'summary',
            partner_type: 'customer',
            partner_name: 'Công ty A',
            tax_code: '0101',
            partner_code: '131-01',
            opening_debit: 0,
            opening_credit: 0,
            period_debit: 0,
            period_credit: 500_000,
            closing_debit: 0,
            closing_credit: 500_000,
          },
        },
        {
          rowNumber: 2,
          raw: [],
          normalized: {
            record_type: 'detail',
            partner_type: 'customer',
            partner_name: 'Công ty A',
            partner_code: '131-01',
            txn_date: '2026-01-20',
            debit: 0,
            credit: 500_000,
          },
        },
      ],
    }
    const bank = {
      filename: 'SPNH.xlsx',
      kind: 'bank' as const,
      sheetName: 'TCB',
      sha256: 'bank',
      rows: [{
        rowNumber: 12,
        raw: [],
        normalized: {
          txn_date: '2026-01-20',
          direction: 'thu',
          amount: 500_000,
          partner_name: 'Tên viết khác trên ngân hàng',
          tax_code: null,
        },
      }],
    }

    buildImportPreview([receivable, bank])

    expect(bank.rows[0].normalized).toMatchObject({
      affects_debt: true,
      partner_code: '131-01',
      partner_name: 'Công ty A',
    })
  })

  it('gắn nhật ký nhập khẩu vào dòng tiền hàng, không gắn vào dòng thuế cùng số tờ khai', () => {
    const purchaseListing = {
      filename: 'purchase.xls',
      kind: 'purchase_listing' as const,
      sheetName: 'Sheet1',
      sha256: 'purchase',
      rows: [
        {
          rowNumber: 1,
          raw: [],
          normalized: {
            invoice_no: '108063512210',
            invoice_date: '2026-03-18',
            order_type: 'import',
            purchase_nature: 'goods',
            customs_declaration_no: '108063512210',
            partner_name: 'MINT KOREA',
            subtotal: 200_000_000,
            vat_amount: 16_000_000,
            grand_total: 216_000_000,
          },
        },
        {
          rowNumber: 2,
          raw: [],
          normalized: {
            invoice_no: '108063512210',
            invoice_date: '2026-03-08',
            order_type: 'import',
            purchase_nature: 'import_duty',
            customs_declaration_no: '108063512210',
            partner_name: 'MINT KOREA',
            subtotal: 750_000,
            vat_amount: 0,
            grand_total: 750_000,
          },
        },
      ],
    }
    const purchaseJournal = {
      filename: 'journal.xlsx',
      kind: 'purchase_journal' as const,
      sheetName: 'Sheet1',
      sha256: 'journal',
      rows: [{
        rowNumber: 1,
        raw: [],
        normalized: {
          invoice_no: '108063512210',
          invoice_date: '2026-03-08',
          product_code: 'MH-NK',
          product_name: 'Hàng nhập khẩu',
          quantity: 1,
          amount: 200_000_000,
        },
      }],
    }

    buildImportPreview([purchaseListing, purchaseJournal])

    expect(purchaseJournal.rows[0].normalized).toMatchObject({
      invoice_date: '2026-03-08',
      posting_invoice_date: '2026-03-18',
      linked_purchase_nature: 'goods',
    })
  })
})
