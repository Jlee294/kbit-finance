import { z } from 'zod'

export const expenseVnSchema = z.object({
  company_id: z.string().uuid('Chọn công ty'),
  bank_account_id: z.string().uuid('Chọn tài khoản ngân hàng'),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ'),
  amount_vnd: z.coerce.number().positive('Số tiền phải > 0'),
  note: z.string().optional().nullable(),

  // Trục 1: VAT
  has_vat: z.boolean().default(false),
  vat_amount: z.coerce.number().min(0).default(0),

  // Trục 2: Chi hộ
  is_chi_ho: z.boolean().default(false),
  chi_ho_person: z.string().optional().nullable(),

  // Phân loại
  expense_category: z.string().optional().nullable(),
  operation_id: z.string().uuid().optional().nullable(),

  // Nội bộ
  is_intercompany: z.boolean().default(false),
  counterpart_company_id: z.string().uuid().optional().nullable(),

  // Liên kết
  project_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  supplier_order_id: z.string().uuid().optional().nullable(),

  // Định khoản tay (Nợ/Có) — tùy chọn
  dinh_khoan_no: z.string().optional().nullable(),
  dinh_khoan_co: z.string().optional().nullable(),
})
  .refine(
    (d) => !d.is_chi_ho || (d.chi_ho_person && d.chi_ho_person.trim() !== ''),
    { message: 'Phải nhập tên người được chi hộ', path: ['chi_ho_person'] },
  )
  .refine(
    (d) => !d.has_vat || d.vat_amount > 0,
    { message: 'Số tiền VAT phải > 0 khi có hóa đơn VAT', path: ['vat_amount'] },
  )
  .refine(
    (d) => !d.is_intercompany || !!d.counterpart_company_id,
    { message: 'Phải chọn công ty đối ứng khi là giao dịch nội bộ', path: ['counterpart_company_id'] },
  )

export type ExpenseVnInput = z.infer<typeof expenseVnSchema>

export const collectReceivableSchema = z.object({
  receivable_id: z.string().uuid(),
  collect_amount: z.coerce.number().positive('Số tiền phải > 0'),
})

export type CollectReceivableInput = z.infer<typeof collectReceivableSchema>

/** Trả công nợ NCC trong nước (VNĐ): vừa ghi phiếu chi vừa giảm nợ đơn. */
export const payVnSupplierSchema = z.object({
  supplier_order_id: z.string().uuid('Chọn đơn mua cần trả'),
  bank_account_id:   z.string().uuid('Chọn tài khoản chi'),
  amount_vnd:        z.coerce.number().positive('Số tiền phải > 0'),
  txn_date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ'),
  note:              z.string().optional().nullable(),
  dinh_khoan_no:     z.string().optional().nullable(),
  dinh_khoan_co:     z.string().optional().nullable(),
})

export type PayVnSupplierInput = z.infer<typeof payVnSupplierSchema>
