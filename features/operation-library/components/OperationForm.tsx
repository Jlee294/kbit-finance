'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DocChecklistPicker } from './DocChecklistPicker'
import { createOperation, updateOperation } from '../actions'
import type { Operation } from '../queries'
import type { DocumentType } from '@/features/document-types/queries'

const GROUP_OPTIONS = ['Mua hàng', 'Bán hàng', 'Chi phí', 'Lương', 'Thuế', 'Tài sản', 'Khác']

interface Props {
  editItem?: Operation
  docTypes: DocumentType[]
  onDone?: () => void
}

export function OperationForm({ editItem, docTypes, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(editItem?.code ?? '')
  const [name, setName] = useState(editItem?.name ?? '')
  const [groupName, setGroupName] = useState(editItem?.group_name ?? '')
  const [taxGtgt, setTaxGtgt] = useState(editItem?.tax_gtgt ?? '')
  const [taxTndn, setTaxTndn] = useState(editItem?.tax_tndn_deductible ?? false)
  const [taxTncn, setTaxTncn] = useState(editItem?.tax_tncn ?? '')
  const [taxFct, setTaxFct] = useState(editItem?.tax_fct ?? '')
  const [requiredIds, setRequiredIds] = useState<string[]>(editItem?.required_doc_type_ids ?? [])
  const [recommendedIds, setRecommendedIds] = useState<string[]>(editItem?.recommended_doc_type_ids ?? [])
  const [notes, setNotes] = useState(editItem?.notes ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        code,
        name,
        group_name: groupName || null,
        tax_gtgt: taxGtgt || null,
        tax_tndn_deductible: taxTndn,
        tax_tncn: taxTncn || null,
        tax_fct: taxFct || null,
        required_doc_type_ids: requiredIds,
        recommended_doc_type_ids: recommendedIds,
        notes: notes || null,
      }
      if (editItem) {
        await updateOperation(editItem.id, payload)
      } else {
        await createOperation(payload)
      }
      router.refresh()
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Mã nghiệp vụ <span className="text-red-500">*</span></Label>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VD: CHI_VAT" required />
        </div>
        <div className="space-y-1">
          <Label>Nhóm</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          >
            <option value="">-- Chọn nhóm --</option>
            {GROUP_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Tên nghiệp vụ <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Chi phí có hóa đơn VAT" required />
      </div>

      {/* Tax fields */}
      <div className="rounded-lg border px-4 py-3 space-y-3 bg-gray-50">
        <p className="text-sm font-semibold text-gray-700">Thông tin thuế (tùy chọn)</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Thuế GTGT</Label>
            <Input value={taxGtgt} onChange={(e) => setTaxGtgt(e.target.value)} placeholder="VD: 10%" className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Thuế TNCN</Label>
            <Input value={taxTncn} onChange={(e) => setTaxTncn(e.target.value)} placeholder="VD: 10%" className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Thuế nhà thầu (FCT)</Label>
            <Input value={taxFct} onChange={(e) => setTaxFct(e.target.value)} placeholder="VD: 5%" className="text-sm" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4" checked={taxTndn} onChange={(e) => setTaxTndn(e.target.checked)} />
          Chi phí được trừ thuế TNDN
        </label>
      </div>

      {/* Doc checklist */}
      <div className="space-y-3">
        <DocChecklistPicker
          label="Hồ sơ bắt buộc"
          docTypes={docTypes}
          selected={requiredIds}
          onChange={setRequiredIds}
        />
        <DocChecklistPicker
          label="Hồ sơ khuyến nghị (không bắt buộc)"
          docTypes={docTypes}
          selected={recommendedIds.filter((id) => !requiredIds.includes(id))}
          onChange={(ids) => setRecommendedIds(ids)}
        />
      </div>

      <div className="space-y-1">
        <Label>Ghi chú</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú thêm..." />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone?.()} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : editItem ? 'Cập nhật' : 'Thêm mới'}
        </Button>
      </div>
    </form>
  )
}
