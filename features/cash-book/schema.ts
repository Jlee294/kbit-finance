import { z } from 'zod'

export const CASH_DIRECTIONS = ['thu', 'chi'] as const
export type CashDirection = (typeof CASH_DIRECTIONS)[number]

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const cashBookSchema = z.object({
  company_id:    z.string().uuid('Chọn công ty'),
  ky_hieu:       z.string().optional().nullable(),
  txn_date:      z.string().regex(dateRegex, 'Ngày không hợp lệ'),
  doi_tac:       z.string().optional().nullable(),
  ma_doi_tac:    z.string().optional().nullable(),
  noi_dung:      z.string().min(1, 'Nhập nội dung'),
  so_tien:       z.coerce.number().refine((v) => v > 0, 'Số tiền > 0'),
  direction:     z.enum(CASH_DIRECTIONS),
  ghi_chu:       z.string().optional().nullable(),
  dinh_khoan_no: z.string().optional().nullable(),
  dinh_khoan_co: z.string().optional().nullable(),
})

export type CashBookInput = z.infer<typeof cashBookSchema>
