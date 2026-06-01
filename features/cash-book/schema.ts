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
  nhan_su_thuc_hien: z.string().uuid().optional().nullable(),
  is_chi_ho:     z.boolean().default(false),
  chi_ho_person: z.string().optional().nullable(),
  is_thu_ho:     z.boolean().default(false),
  thu_ho_person: z.string().optional().nullable(),
}).refine(
  (d) => !d.is_chi_ho || (d.chi_ho_person && d.chi_ho_person.trim() !== ''),
  { message: 'Nhập tên người được chi hộ', path: ['chi_ho_person'] },
).refine(
  (d) => !d.is_thu_ho || (d.thu_ho_person && d.thu_ho_person.trim() !== ''),
  { message: 'Nhập tên người được thu hộ', path: ['thu_ho_person'] },
)

export type CashBookInput = z.infer<typeof cashBookSchema>
