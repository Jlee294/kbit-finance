'use client'

import { useTransition } from 'react'
import { toast }         from 'sonner'
import { runAssessment } from '../actions'

interface Props {
  companyId: string
  period?:   string
}

const LIGHT_LABEL: Record<string, string> = {
  green:  'Bình thường',
  yellow: 'Cần theo dõi',
  red:    'Rủi ro cao',
}

export function RunAssessmentButton({ companyId, period }: Props) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await runAssessment(companyId, period)
        const label  = LIGHT_LABEL[result.overall] ?? result.overall
        toast.success(`Chấm điểm xong — Sức khỏe tổng: ${label}`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định'
        toast.error(msg)
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
                 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? 'Đang chấm...' : 'Chấm điểm ngay'}
    </button>
  )
}
