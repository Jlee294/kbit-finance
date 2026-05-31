'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { reconcileEntity } from '@/features/documents/reconcile'
import { transitionSchema, type TransitionInput } from './schema'
import { dispatchAlert } from '@/features/integrations/alerts'

const TABLE = {
  income:  'income_transactions',
  expense: 'expense_transactions',
} as const

// ── Map mã lỗi DB → tiếng Việt thân thiện ──────────────────────────────────────
function mapDbError(msg: string): string {
  if (msg.includes('NGUOI_NHAP_KHONG_DUOC_TU_DUYET'))
    return 'Người duyệt phải khác người nhập.'
  if (msg.includes('THIEU_NGUOI_NHAP'))
    return 'Không thể duyệt giao dịch khuyết người nhập.'
  if (msg.includes('KHONG_DU_QUYEN_DUYET'))
    return 'Bạn không có quyền duyệt khoản này.'
  if (msg.includes('THIEU_NGUOI_DUYET'))
    return 'Không xác định được người duyệt — hãy đăng nhập lại.'
  if (msg.includes('TT_CHUYEN_SAI'))
    return 'Bước chuyển trạng thái không hợp lệ.'
  if (msg.includes('TT_KHOI_TAO_KHONG_HOP_LE'))
    return 'Giao dịch mới chỉ được tạo ở trạng thái nháp hoặc đã xác nhận.'
  if (msg.includes('KY_DA_KHOA'))
    return 'Kỳ kế toán đã khóa — không thể sửa giao dịch trong kỳ này.'
  if (msg.startsWith('THIEU_HO_SO:'))
    return 'Thiếu hồ sơ bắt buộc: ' + msg.slice('THIEU_HO_SO:'.length).split(',').join(', ')
  return msg
}

// ── Action chính: chuyển trạng thái giao dịch ───────────────────────────────────
export async function transitionTxn(input: TransitionInput): Promise<void> {
  const { kind, id, to } = transitionSchema.parse(input)
  const supabase = await createClient()

  // D11/I3: rời 'draft' (→ confirmed) HOẶC duyệt (→ approved) với expense
  //   → BẮT BUỘC đủ hồ sơ theo operation_id. Một nơi kiểm duy nhất — bịt khe lọt.
  //   income không có operation_id → reconcileEntity(..., null) = isComplete=true → bỏ qua an toàn.
  if ((to === 'confirmed' || to === 'approved') && kind === 'expense') {
    const { data: exp, error: eRead } = await supabase
      .from('expense_transactions')
      .select('operation_id')
      .eq('id', id)
      .single()
    if (eRead || !exp) throw new Error('Không tìm thấy giao dịch chi để kiểm hồ sơ.')

    const rec = await reconcileEntity(
      'expense',
      id,
      (exp.operation_id as string | null) ?? null,
    )
    if (!rec.isComplete) {
      throw new Error(mapDbError('THIEU_HO_SO:' + rec.missingCodes.join(',')))
    }
  }

  // Chỉ gửi status. approved_by do trigger kbit_approval_guard tự gán theo auth.uid().
  const { error } = await supabase
    .from(TABLE[kind])
    .update({ status: to })
    .eq('id', id)

  if (error) throw new Error(mapDbError(error.message))

  // ── Alert: thông báo khi duyệt xong ────────────────────────────────────
  if (to === 'approved') {
    // Fetch thêm info để format thông báo (best-effort — không throw)
    void (async () => {
      try {
        const table = TABLE[kind]
        const { data: txn } = await supabase
          .from(table)
          .select('txn_date, amount, amount_vnd, currency, note, companies!company_id(name)')
          .eq('id', id)
          .single() as { data: Record<string, any> | null; error: unknown }

        if (txn) {
          await dispatchAlert({
            type: 'txn_approved',
            kind,
            companyName: (txn.companies as any)?.name ?? 'KBIT',
            amount: kind === 'income' ? (txn.amount as number) : (txn.amount_vnd as number),
            currency: kind === 'income' ? (txn.currency as string) : 'VND',
            txnDate: txn.txn_date as string,
            note: (txn.note as string | null) ?? undefined,
          })
        }
      } catch {
        // Lỗi alert không ảnh hưởng giao dịch
      }
    })()
  }

  revalidatePath('/duyet-khoa-ky')
  revalidatePath('/chi-vn')
  revalidatePath('/thu-tien')
}
