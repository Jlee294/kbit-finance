/**
 * EmptyState — Trang/bảng trống có hướng dẫn next action.
 *
 *   <EmptyState
 *     icon="📦"
 *     title="Chưa có giao dịch nào"
 *     description="Bấm + Tạo đơn để thêm đơn hàng đầu tiên"
 *     action={<Button>+ Tạo đơn</Button>}
 *   />
 */

import type { ReactNode } from 'react'

interface Props {
  /** Emoji string hoặc icon component */
  icon?: string | ReactNode
  title: string
  description?: string
  action?: ReactNode
  /** compact: spacing nhỏ hơn (cho dùng trong bảng) */
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, compact = false }: Props) {
  return (
    <div className={`rounded-xl border border-dashed border-gray-300 bg-white text-center ${
      compact ? 'px-6 py-8' : 'px-6 py-12'
    }`}>
      {icon && (
        <div className={`${compact ? 'text-3xl' : 'text-5xl'} mb-3 opacity-50`}>
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
