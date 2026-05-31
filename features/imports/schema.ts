import { z } from 'zod'

/** Một dòng hàng nhập khẩu. unit_cost KHÔNG nhập tay — app phân bổ (cost.ts). */
export const importItemSchema = z.object({
  product_id:  z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  qty:         z.coerce.number().positive('Số lượng phải > 0'),
  unit_price:  z.coerce.number().nonnegative('Đơn giá phải ≥ 0'),
})

/** Header đơn NCC nhập khẩu. KHÔNG chứa cost_total / outstanding (GENERATED ở DB). */
export const supplierImportSchema = z.object({
  company_id:  z.string().uuid('Chọn công ty'),
  project_id:  z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid('Chọn nhà cung cấp'),
  order_code:  z.string().min(1, 'Mã đơn bắt buộc'),
  order_date:  z.string().min(1, 'Chọn ngày'),
  currency:    z.enum(['VND', 'KRW']),
  // C4/D4: BẮT BUỘC khi currency='KRW' (Phase 4 đọc làm rate_booked khi trả NCC)
  exchange_rate: z.coerce.number().positive('Tỷ giá phải > 0').optional().nullable(),
  goods_value: z.coerce.number().nonnegative('Phải ≥ 0'),
  import_duty: z.coerce.number().nonnegative().default(0),
  vat_import:  z.coerce.number().nonnegative().default(0), // VAT khâu NK: khấu trừ riêng, KHÔNG vào giá vốn
  other_fees:  z.coerce.number().nonnegative().default(0), // phí HQ/đại lý (⏳ A3)
  is_intercompany:        z.boolean().default(false),
  counterpart_company_id: z.string().uuid().optional().nullable(),
  items: z.array(importItemSchema).min(1, 'Cần ít nhất 1 dòng hàng'),
})
  .superRefine((v, ctx) => {
    // C4/D4: đơn ngoại tệ KRW phải có tỷ giá ghi nợ
    if (v.currency === 'KRW' && (v.exchange_rate == null || v.exchange_rate <= 0)) {
      ctx.addIssue({
        code: 'custom', path: ['exchange_rate'],
        message: 'Đơn ngoại tệ (KRW) phải nhập tỷ giá ghi nợ',
      })
    }
    // D9/I1: nội bộ phải chọn pháp nhân đối ứng
    if (v.is_intercompany && !v.counterpart_company_id) {
      ctx.addIssue({
        code: 'custom', path: ['counterpart_company_id'],
        message: 'Giao dịch nội bộ phải chọn pháp nhân đối ứng',
      })
    }
  })

export type SupplierImportInput = z.infer<typeof supplierImportSchema>
export type ImportItemInput     = z.infer<typeof importItemSchema>
