'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canApprove, getCurrentUser } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { createClient } from '@/lib/supabase/server'

export interface ImportBatchActionState {
  error?: string
  message?: string
}

const batchSchema = z.object({
  batch_id: z.string().uuid('Mã lô không hợp lệ'),
})

const explanationSchema = batchSchema.extend({
  check_id: z.string().uuid('Mã kiểm tra không hợp lệ'),
  explanation: z.string().trim().min(10, 'Giải trình tối thiểu 10 ký tự').max(1_000),
})

async function requireApprover() {
  if (isDemoMode()) throw new Error('Chế độ local chỉ xem trước, chưa ghi vào cơ sở dữ liệu')
  const me = await getCurrentUser()
  if (!me || !canApprove(me.role)) {
    throw new Error('Chỉ admin, kế toán trưởng hoặc giám đốc được thực hiện bước này')
  }
  return createClient()
}

function refreshAccountingPages() {
  revalidatePath('/bang-ke-ban-ra')
  revalidatePath('/bang-ke-mua-vao')
  revalidatePath('/giao-dich')
  revalidatePath('/kho')
  revalidatePath('/cong-no')
  revalidatePath('/bao-cao')
}

export async function explainImportCheck(
  _previousState: ImportBatchActionState,
  formData: FormData,
): Promise<ImportBatchActionState> {
  try {
    const input = explanationSchema.parse({
      batch_id: formData.get('batch_id'),
      check_id: formData.get('check_id'),
      explanation: formData.get('explanation'),
    })
    const supabase = await requireApprover()
    const { error } = await supabase.rpc('kbit_explain_import_check' as any, {
      p_check_id: input.check_id,
      p_explanation: input.explanation,
    } as any)
    if (error) throw new Error(error.message)
    refreshAccountingPages()
    return { message: 'Đã duyệt giải trình. Lô sẽ mở bước duyệt khi không còn kiểm tra chưa xử lý.' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Không lưu được giải trình' }
  }
}

export async function approveImportBatch(
  _previousState: ImportBatchActionState,
  formData: FormData,
): Promise<ImportBatchActionState> {
  try {
    const input = batchSchema.parse({ batch_id: formData.get('batch_id') })
    const supabase = await requireApprover()
    const { error } = await supabase.rpc('kbit_approve_import_batch' as any, {
      p_batch_id: input.batch_id,
    } as any)
    if (error) throw new Error(error.message)
    refreshAccountingPages()
    return { message: 'Đã duyệt lô. Có thể ghi sổ.' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Không duyệt được lô' }
  }
}

export async function postImportBatch(
  _previousState: ImportBatchActionState,
  formData: FormData,
): Promise<ImportBatchActionState> {
  try {
    const input = batchSchema.parse({ batch_id: formData.get('batch_id') })
    const supabase = await requireApprover()
    const { error } = await supabase.rpc('kbit_post_import_batch' as any, {
      p_batch_id: input.batch_id,
    } as any)
    if (error) throw new Error(error.message)
    refreshAccountingPages()
    return { message: 'Đã ghi toàn bộ lô vào sổ chính.' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Không ghi sổ được lô' }
  }
}

export async function rollbackImportBatch(
  _previousState: ImportBatchActionState,
  formData: FormData,
): Promise<ImportBatchActionState> {
  try {
    const input = batchSchema.parse({ batch_id: formData.get('batch_id') })
    const supabase = await requireApprover()
    const { error } = await supabase.rpc('kbit_rollback_import_batch' as any, {
      p_batch_id: input.batch_id,
    } as any)
    if (error) throw new Error(error.message)
    refreshAccountingPages()
    return { message: 'Đã hoàn tác toàn bộ chứng từ do lô này tạo.' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Không hoàn tác được lô' }
  }
}
