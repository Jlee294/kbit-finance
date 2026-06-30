/**
 * EmptyState — Trang/bảng trống có hướng dẫn next action.
 * Dùng component KBIT (@kbit/ui) để đồng nhất nhận diện.
 *
 *   <EmptyState icon="📦" title="Chưa có giao dịch" description="…" action={<Button/>} />
 */

import type { ReactNode } from 'react'
import { KbitEmptyState } from '@/components/kbit'

interface Props {
  icon?: string | ReactNode
  title: string
  description?: string | ReactNode
  action?: ReactNode
  /** compact: spacing nhỏ hơn (cho dùng trong bảng) */
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, compact = false }: Props) {
  return (
    <KbitEmptyState
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={compact ? 'py-8' : undefined}
    />
  )
}
