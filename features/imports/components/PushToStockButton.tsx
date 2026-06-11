'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { pushImportOrderToStock } from '../actions'

interface Props {
  orderId:     string
  stockAdded:  boolean
  warehouseId: string | null
  hasProducts: boolean   // có ít nhất 1 dòng gắn product_id
}

export function PushToStockButton({ orderId, stockAdded, warehouseId, hasProducts }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')

  if (stockAdded) {
    return (
      <div className="flex items-center gap-2 text-sm bg-brand-50 border border-brand-100 rounded-md px-3 py-2 text-brand-800">
        <span>✓ Đơn này đã đẩy vào kho.</span>
        <a href="/kho/lich-su" className="text-xs text-brand-700 hover:underline">→ Xem sổ kho</a>
      </div>
    )
  }

  if (!hasProducts) {
    return (
      <div className="flex flex-col gap-1 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        <p className="font-medium text-amber-800">⚠ Chưa thể đẩy vào kho</p>
        <p className="text-xs text-amber-700">
          Đơn không có dòng nào gắn <strong>Mã hàng</strong>. Bấm <strong>Sửa</strong> đơn, chọn Mã hàng cho từng dòng (cột Sản phẩm) rồi thử lại.
        </p>
      </div>
    )
  }

  function push() {
    if (!confirm('Đẩy đơn này vào kho? Số lượng + giá vốn sẽ cộng vào tồn kho.')) return
    setMsg('')
    start(async () => {
      const res = await pushImportOrderToStock(orderId)
      if (!res.ok) { setMsg('❌ ' + res.error); return }
      setMsg(`✓ Đã đẩy ${res.pushed} dòng vào kho`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-amber-800">⚠ Chưa đẩy vào kho</p>
          <p className="text-xs text-amber-700 mt-0.5">
            {warehouseId ? 'Bấm để cộng số lượng + giá vốn vào tồn kho.' : 'Đơn chưa gắn kho — sẽ tự dùng kho chính của công ty.'}
          </p>
        </div>
        <Button size="sm" onClick={push} disabled={pending} className="text-xs whitespace-nowrap">
          {pending ? 'Đang đẩy…' : '📦 Đẩy vào kho'}
        </Button>
      </div>
      {msg && (
        <p className={`text-xs ${msg.startsWith('✓') ? 'text-brand-700' : 'text-red-700'}`}>{msg}</p>
      )}
    </div>
  )
}
