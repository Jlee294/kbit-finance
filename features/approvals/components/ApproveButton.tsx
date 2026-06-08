'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { transitionTxn } from '@/features/approvals/actions'
import type { TxnKind } from '../schema'

interface Props {
  kind:       TxnKind
  id:         string
  status:     string
  canApprove: boolean
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Nháp',        cls: 'text-gray-500' },
  confirmed: { label: 'Chờ duyệt',   cls: 'text-amber-600 font-medium' },
  approved:  { label: 'Đã duyệt',    cls: 'text-brand-700 font-medium' },
  void:      { label: 'Đã hủy',      cls: 'text-red-500 line-through' },
}

export function ApproveButton({ kind, id, status, canApprove }: Props) {
  const [pending, start] = useTransition()

  function go(to: 'confirmed' | 'approved' | 'draft' | 'void') {
    start(async () => {
      try {
        await transitionTxn({ kind, id, to })
        toast.success('Đã cập nhật trạng thái')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Lỗi')
      }
    })
  }

  const meta = STATUS_LABEL[status] ?? { label: status, cls: 'text-gray-500' }

  if (status === 'approved') {
    return <span className={meta.cls}>{meta.label}</span>
  }
  if (status === 'void') {
    return (
      <div className="flex items-center gap-2">
        <span className={meta.cls}>{meta.label}</span>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => go('draft')}>
          Mở lại
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className={meta.cls}>{meta.label}</span>
      {status === 'draft' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => go('confirmed')}>
          Xác nhận
        </Button>
      )}
      {status === 'confirmed' && canApprove && (
        <Button size="sm" disabled={pending} onClick={() => go('approved')}>
          Duyệt
        </Button>
      )}
      {status === 'confirmed' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => go('draft')}>
          Trả nháp
        </Button>
      )}
      {(status === 'draft' || status === 'confirmed') && (
        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" disabled={pending} onClick={() => go('void')}>
          Hủy
        </Button>
      )}
    </div>
  )
}
