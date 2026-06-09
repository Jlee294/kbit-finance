'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DIALOG_SM } from '@/lib/ui-tokens'
import { updateBankRowPartner } from '../actions'
import type { BankRow } from '../queries'

type PartnerOption = { id: string; code: string; name: string }

interface Props {
  row: BankRow | null
  customers: PartnerOption[]   // cho direction='thu'
  suppliers: PartnerOption[]   // cho direction='chi' VN
  krSuppliers: PartnerOption[] // cho direction='chi' KR
  onClose: () => void
}

const SELECT_CLS = 'w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'

export function BankRowEditDialog({ row, customers, suppliers, krSuppliers, onClose }: Props) {
  const router = useRouter()
  const [partnerId, setPartnerId] = useState<string>('')
  const [note,      setNote]      = useState<string>('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string>('')

  // Reset state khi đổi row
  useEffect(() => {
    if (!row) return
    // Tìm partner id từ partner_name (tạm — cải tiến sau nếu BankRow expose partner_id)
    const partners = row.direction === 'thu'
      ? customers
      : row.region === 'KR' ? krSuppliers : suppliers
    const found = partners.find((p) => p.name === row.partner_name)
    setPartnerId(found?.id ?? '')
    setNote(row.note ?? '')
    setError('')
  }, [row, customers, suppliers, krSuppliers])

  if (!row) return null

  const partnerLabel = row.direction === 'thu' ? 'Khách hàng' : 'Nhà cung cấp'
  const partners = row.direction === 'thu'
    ? customers
    : row.region === 'KR' ? krSuppliers : suppliers

  async function handleSubmit() {
    if (!row) return
    setSaving(true)
    setError('')
    const res = await updateBankRowPartner({
      id:        row.id,
      direction: row.direction,
      partnerId: partnerId || null,
      note:      note.trim() || null,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.refresh()
    onClose()
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className={DIALOG_SM}>
        <DialogHeader>
          <DialogTitle>
            Sửa nghiệp vụ ngân hàng — {row.direction === 'thu' ? 'Phiếu thu' : (row.region === 'KR' ? 'Chi KR' : 'Chi VN')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
            <div>Ngày: <span className="font-medium text-gray-900">{row.txn_date}</span></div>
            <div>Tài khoản: <span className="font-medium text-gray-900">{row.bank_account_name ?? '—'}</span></div>
            <div>Số tiền: <span className="font-medium text-gray-900">
              {row.direction === 'thu' ? '+ ' : '− '}
              {row.amount_local.toLocaleString('vi-VN')} {row.currency}
            </span></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {partnerLabel} <span className="text-gray-400 font-normal">(để trống = treo cọc / chưa gắn)</span>
            </label>
            <select
              className={SELECT_CLS}
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">— Chưa gắn —</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <input
              type="text"
              className={SELECT_CLS}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú nội bộ..."
            />
          </div>

          {error && (
            <div className="rounded-md bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Huỷ</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
