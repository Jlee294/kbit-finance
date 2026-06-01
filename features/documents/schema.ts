import { z } from 'zod'

export const docEntityType = z.enum(['customer_order', 'supplier_order', 'income', 'expense'])
export type DocEntityType = z.infer<typeof docEntityType>

export const uploadDocumentSchema = z.object({
  document_type_id: z.string().uuid('Chọn loại chứng từ'),
  entity_type: docEntityType,
  entity_id: z.string().uuid(),
  file_name: z.string().min(1, 'Tên file không được để trống').max(200),
  /** Drive file ID (KHÔNG share ra UI — chỉ dùng nội bộ để proxy stream) */
  drive_file_id: z.string().min(5).optional().nullable(),
  /** @deprecated — giữ tương thích ngược; URL mới được ẩn, dùng /api/files/[id] */
  file_url: z.string().url().optional().nullable(),
})

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>
