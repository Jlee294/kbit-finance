'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND } from '@/lib/format'
import { collectReceivable } from '../actions'

interface Props {
  receivable: {
    id: string
    person: string
    amount: number
    collected_amount: number
    expense_txn_date?: string
    expense_note?: string | null
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReceivableCollectDialog({ receivable, open, onOpenChange }: Props) {
  const router = useRouter()
  const remaining = receivable.amount - receivable.collected_amount

  const [collectAmount, setCollectAmount] = useState(String(remaining))
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await collectReceivable({
        receivable_id:   receivable.id,
        collect_amount:  parseFloat(collectAmount),
      })
      router.refresh()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thu lại tiền chi hộ</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-gray-50 border px-4 py-3 text-sm space-y-1 mb-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Người được chi hộ:</span>
            <span className="font-medium">{receivable.person}</span>
          </div>
          {receivable.expense_txn_date && (
            <div className="flex justify-between text-gray-500">
              <span>Ngày chi:</span>
              <span>{receivable.expense_txn_date}</span>
            </div>
          )}
          {receivable.expense_note && (
            <div className="flex justify-between text-gray-500">
              <span>Ghi chú chi:</span>
              <span className="text-right max-w-[60%]">{receivable.expense_note}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t">
            <span className="text-gray-600">Tổng phải thu:</span>
            <span className="font-semibold">{formatVND(receivable.amount)}</span>
          </div>
          {receivable.collected_amount > 0 && (
            <div className="flex justify-between text-green-700">
              <span>Đã thu:</span>
              <span>{formatVND(receivable.collected_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-amber-600">
            <span>Còn lại:</span>
            <span>{formatVND(remaining)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Số tiền thu lại <span className="text-red-500">*</span></Label>
            <Input
              type="number" min="1" max={remaining} step="1000"
              value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)}
              required
            />
            {parseFloat(collectAmount) > 0 && (
              <p className="text-xs text-gray-500">{formatVND(parseFloat(collectAmount))}</p>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Đang lưu...' : 'Xác nhận thu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
