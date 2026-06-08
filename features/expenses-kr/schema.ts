import { z } from 'zod'

/** Nhập 1 phiếu chi tại Hàn Quốc (region='KR' cố định). */
export const krExpenseSchema = z.object({
  company_id:      z.string().uuid('Chọn công ty'),
  bank_account_id: z.string().uuid('Chọn tài khoản KRW'),
  supplier_id:     z.string().uuid().optional().nullable(),
  amount_krw:      z.coerce.number().positive('KRW phải > 0'),
  exchange_rate:   z.coerce.number().positive('Tỷ giá phải > 0'),
  txn_date:        z.string().min(1, 'Chọn ngày'),
  expense_kind:    z.enum(['goods', 'service']),   // ⏳ A2: service → nhắc FCT
  has_vat:         z.boolean().default(false),
  vat_amount:      z.coerce.number().min(0).default(0),
  note:            z.string().optional().nullable(),
  project_id:      z.string().uuid().optional().nullable(),
  is_intercompany: z.boolean().default(false),
  counterpart_company_id: z.string().uuid().optional().nullable(),
  dinh_khoan_no:   z.string().optional().nullable(),
  dinh_khoan_co:   z.string().optional().nullable(),
})
  .refine(
    (d) => !d.is_intercompany || !!d.counterpart_company_id,
    { path: ['counterpart_company_id'], message: 'Giao dịch nội bộ phải chọn công ty đối ứng' },
  )
  .refine(
    (d) => !d.has_vat || d.vat_amount > 0,
    { path: ['vat_amount'], message: 'Số tiền VAT phải > 0 khi có hóa đơn VAT' },
  )

export type KrExpenseInput = z.infer<typeof krExpenseSchema>

/** Trả công nợ NCC ngoại tệ (sinh chênh lệch tỷ giá). */
export const krSupplierPaySchema = z.object({
  supplier_order_id: z.string().uuid('Chọn đơn NCC'),
  bank_account_id:   z.string().uuid('Chọn tài khoản KRW'),
  amount_krw:        z.coerce.number().positive('KRW phải > 0'),
  rate_settled:      z.coerce.number().positive('Tỷ giá lúc trả phải > 0'),
  // D4/C4: rate_booked ĐỌC từ supplier_orders.exchange_rate trong RPC.
  // Chỉ gửi khi đơn chưa có exchange_rate (fallback).
  rate_booked:       z.coerce.number().positive().optional().nullable(),
  txn_date:          z.string().min(1, 'Chọn ngày'),
  note:              z.string().optional().nullable(),
  dinh_khoan_no:     z.string().optional().nullable(),
  dinh_khoan_co:     z.string().optional().nullable(),
})

export type KrSupplierPayInput = z.infer<typeof krSupplierPaySchema>
