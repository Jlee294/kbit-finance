'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduct, updateProduct } from '../actions'
import type { ProductRow } from '../queries'
import type { Brand } from '@/features/brands/queries'
import { COST_CURRENCIES } from '../schema'

interface Props {
  initial?:  Partial<ProductRow>
  brands?:   Brand[]
  onDone:    () => void
}

const CURR_OPTIONS = COST_CURRENCIES

function CostField({
  label,
  amount, onAmount,
  curr,   onCurr,
}: {
  label: string
  amount: string; onAmount: (v: string) => void
  curr:   string; onCurr:   (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="flex gap-1">
        <Input
          type="number" min="0" step="any"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          placeholder="0"
          className="h-8 text-sm"
        />
        <select
          value={curr}
          onChange={(e) => onCurr(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs shrink-0"
        >
          {CURR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  )
}

export function ProductForm({ initial, brands = [], onDone }: Props) {
  const router = useRouter()

  // Base fields
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? 'cái')
  const [brandId, setBrandId] = useState(initial?.brand_id ?? '')

  // Cost fields
  const [cMaterial,     setCMaterial]     = useState(initial?.cost_material     != null ? String(initial.cost_material)     : '')
  const [cMaterialCurr, setCMaterialCurr] = useState(initial?.cost_material_curr  ?? 'KRW')
  const [cBottle,       setCBottle]       = useState(initial?.cost_bottle       != null ? String(initial.cost_bottle)       : '')
  const [cBottleCurr,   setCBottleCurr]   = useState(initial?.cost_bottle_curr    ?? 'KRW')
  const [cPkg,          setCPkg]          = useState(initial?.cost_packaging    != null ? String(initial.cost_packaging)    : '')
  const [cPkgCurr,      setCPkgCurr]      = useState(initial?.cost_packaging_curr ?? 'KRW')
  const [cShip,         setCShip]         = useState(initial?.cost_shipping     != null ? String(initial.cost_shipping)     : '')
  const [cShipCurr,     setCShipCurr]     = useState(initial?.cost_shipping_curr  ?? 'KRW')

  // Price list
  const [priceKR, setPriceKR] = useState(initial?.price_list_kr != null ? String(initial.price_list_kr) : '')
  const [priceVN, setPriceVN] = useState(initial?.price_list_vn != null ? String(initial.price_list_vn) : '')

  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')

    const payload = {
      code, name, unit,
      brand_id:            brandId || null,
      cost_material:       cMaterial     ? parseFloat(cMaterial)     : null,
      cost_material_curr:  cMaterialCurr,
      cost_bottle:         cBottle       ? parseFloat(cBottle)       : null,
      cost_bottle_curr:    cBottleCurr,
      cost_packaging:      cPkg          ? parseFloat(cPkg)          : null,
      cost_packaging_curr: cPkgCurr,
      cost_shipping:       cShip         ? parseFloat(cShip)         : null,
      cost_shipping_curr:  cShipCurr,
      price_list_kr:       priceKR       ? parseFloat(priceKR)       : null,
      price_list_vn:       priceVN       ? parseFloat(priceVN)       : null,
    }

    const result = initial?.id
      ? await updateProduct(initial.id, payload)
      : await createProduct(payload)

    if (result?.error) { setError(result.error); setSaving(false); return }
    router.refresh(); onDone()
  }

  const inp = 'h-8 text-sm'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Thông tin cơ bản ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Mã sản phẩm <span className="text-red-500">*</span></Label>
          <Input className={inp} value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Đơn vị <span className="text-red-500">*</span></Label>
          <Input className={inp} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cái / hộp / kg" required />
        </div>
        <div className="space-y-1">
          <Label>Brand</Label>
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
            className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">— Không có —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Tên sản phẩm <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      {/* ── Chi phí sản xuất ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Chi phí sản xuất</p>
        <div className="grid grid-cols-2 gap-3">
          <CostField label="Giá chất"       amount={cMaterial}  onAmount={setCMaterial}  curr={cMaterialCurr} onCurr={setCMaterialCurr} />
          <CostField label="Giá chai lọ"    amount={cBottle}    onAmount={setCBottle}    curr={cBottleCurr}   onCurr={setCBottleCurr} />
          <CostField label="Giá bao bì"     amount={cPkg}       onAmount={setCPkg}       curr={cPkgCurr}      onCurr={setCPkgCurr} />
          <CostField label="Phí vận chuyển" amount={cShip}      onAmount={setCShip}      curr={cShipCurr}     onCurr={setCShipCurr} />
        </div>
      </div>

      {/* ── Giá niêm yết ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Giá niêm yết</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Giá niêm yết KR (₩)</Label>
            <Input type="number" min="0" step="any" className={inp}
              value={priceKR} onChange={(e) => setPriceKR(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Giá niêm yết VN (đ)</Label>
            <Input type="number" min="0" step="any" className={inp}
              value={priceVN} onChange={(e) => setPriceVN(e.target.value)} placeholder="0" />
          </div>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
