'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { pushOrderToStock } from '../actions'

interface Props {
  orderId:        string
  stockDeducted:  boolean
  fulfillmentStatus: string
  warehouseId:    string | null
  hasProducts:    boolean
}

export function PushOrderToStockButton({ orderId, stockDeducted, fulfillmentStatus, warehouseId, hasProducts }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')

  if (stockDeducted) {
    return (
      <div className="flex items-center gap-2 text-sm bg-brand-50 border border-brand-100 rounded-md px-3 py-2 text-brand-800">
        <span>✓ Đơn đã trừ kho.</span>
        <a href="/kho/lich-su" className="text-xs text-brand-700 hover:underline">→ Xem sổ kho</a>
      </div>
    )
  }

  if (fulfillmentStatus === 'draft') {
    return (
      <div className="text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-600">
        Đơn còn <strong>Nháp</strong> — đổi sang Đã xác nhận / Đã giao thì sẽ tự trừ kho.
      </div>
    )
  }

  if (!hasProducts) {
    return (
      <div className="text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-amber-800">
        ⚠ Đơn không có dòng nào gắn Mã hàng — không thể trừ kho. Sửa đơn để thêm Mã hàng.
      </div>
    )
  }

  function push() {
    if (!confirm('Trừ kho cho đơn này? Số lượng sẽ giảm tồn kho.')) return
    setMsg('')
    start(async () => {
      const res = await pushOrderToStock(orderId)
      if (!res.ok) { setMsg('❌ ' + res.error); return }
      setMsg(`✓ Đã trừ ${res.pushed} dòng khỏi kho`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-amber-800">⚠ Chưa trừ kho</p>
          <p className="text-xs text-amber-700 mt-0.5">
            {warehouseId ? 'Bấm để trừ tồn kho cho đơn này.' : 'Đơn chưa gắn kho — sẽ tự dùng kho chính.'}
          </p>
        </div>
        <Button size="sm" onClick={push} disabled={pending} className="text-xs whitespace-nowrap">
          {pending ? 'Đang trừ…' : '📦 Trừ kho'}
        </Button>
      </div>
      {msg && (
        <p className={`text-xs ${msg.startsWith('✓') ? 'text-brand-700' : 'text-red-700'}`}>{msg}</p>
      )}
    </div>
  )
}
