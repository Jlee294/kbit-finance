'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canEdit, getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ACCOUNTING_TREATMENTS } from '@/features/imports/schema'

const categorySchema = z.object({
  company_id: z.string().uuid('Chọn công ty'),
  code: z.string().trim().min(1, 'Nhập mã').max(40).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, 'Nhập tên').max(150),
  treatment: z.enum(ACCOUNTING_TREATMENTS).refine((value) => value !== 'inventory', {
    message: 'Danh mục tự tạo chỉ dùng cho khoản mua không qua kho',
  }),
})

export async function createAccountingCategory(input: unknown): Promise<{ error?: string }> {
  try {
    const data = categorySchema.parse(input)
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) throw new Error('Không có quyền tạo phân loại')
    const supabase = await createClient()
    const { error } = await supabase.from('accounting_categories').insert({
      ...data,
      created_by: me.id,
    })
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/phan-loai-chi-phi')
    revalidatePath('/nhap-khau')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Không tạo được phân loại' }
  }
}
