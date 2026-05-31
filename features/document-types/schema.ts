import { z } from 'zod'

export const documentTypeSchema = z.object({
  code: z
    .string()
    .min(1, 'Mã không được để trống')
    .max(40, 'Mã tối đa 40 ký tự')
    .trim()
    .toUpperCase(),
  name: z.string().min(1, 'Tên không được để trống').max(120),
})

export type DocumentTypeInput = z.infer<typeof documentTypeSchema>
