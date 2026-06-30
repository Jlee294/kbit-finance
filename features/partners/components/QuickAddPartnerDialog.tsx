'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DIALOG_SM } from '@/lib/ui-tokens'
import { quickCreateCustomer, quickCreateSupplier } from '../actions'

type Kind = 'customer' | 'supplier_vn' | 'supplier_kr'

interface Props {
  kind: Kind
  open: boolean
  onClose: () => void
  /** Gọi sau khi tạo thành công — truyền {id, code, name} để form auto-select. */
  onCreated: (partner: { id: string; code: string; name: string }) => void
  /** Tên gợi ý sẵn (nếu user vừa gõ trong combobox). */
  defaultName?: string
}

const INPUT = 'w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

const LABEL_MAP: Record<Kind, { title: string; nameLabel: string }> = {
  customer:    { title: 'Thêm nhanh khách hàng',           nameLabel: 'Tên khách hàng' },
  supplier_vn: { title: 'Thêm nhanh nhà cung cấp (VN)',    nameLabel: 'Tên NCC' },
  supplier_kr: { title: 'Thêm nhanh nhà cung cấp (KR)',    nameLabel: 'Tên NCC' },
}

export function QuickAddPartnerDialog({ kind, open, onClose, onCreated, defaultName }: Props) {
  const router = useRouter()
  const [name,     setName]     = useState(defaultName ?? '')
  const [taxCode,  setTaxCode]  = useState('')
  const [phone,    setPhone]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const cfg = LABEL_MAP[kind]

  async function handleSubmit() {
    if (!name.trim()) { setError('Tên không được trống'); return }
    setSaving(true); setError('')
    const payload = {
      name: name.trim(),
      tax_code: taxCode.trim() || null,
      phone:    phone.trim()   || null,
    }
    const res = kind === 'customer'
      ? await quickCreateCustomer(payload)
      : await quickCreateSupplier({ ...payload, country: kind === 'supplier_kr' ? 'KR' : 'VN' })
    setSaving(false)
    if (!res.ok) { setError(res.error); return }
    onCreated({ id: res.id, code: res.code, name: res.name })
    router.refresh()
    onClose()
    // Reset
    setName(''); setTaxCode(''); setPhone('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className={DIALOG_SM}>
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <p className="text-xs text-gray-500">
            Mã sẽ tự sinh ({kind === 'customer' ? 'KH' : 'NCC'}-yyyymmdd-xxxx). Bổ sung MST/SĐT sau ở danh mục nếu cần.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {cfg.nameLabel} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên đầy đủ..."
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              MST <span className="text-gray-400 font-normal">(nếu có — tự tránh trùng)</span>
            </label>
            <input
              type="text"
              className={INPUT}
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder="0123456789 hoặc 0123456789-001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại</label>
            <input
              type="text"
              className={INPUT}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
              {saving ? 'Đang tạo…' : 'Tạo & chọn'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
