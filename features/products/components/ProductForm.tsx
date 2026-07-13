'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createProduct, updateProduct, suggestProductCode } from '../actions'
import { createClient } from '@/lib/supabase/client'
import type { ProductRow } from '../queries'
import type { Brand } from '@/features/brands/queries'
import { COST_CURRENCIES } from '../schema'
import { Wand2 } from 'lucide-react'

interface Manufacturer { id: string; code: string; name: string }
interface Formula { id: string; code: string; name: string; manufacturer_id: string }

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
  const isEdit = !!initial?.id

  // Lookup data
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [formulas, setFormulas] = useState<Formula[]>([])

  // Base fields
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? 'Chai')
  const [brandId, setBrandId] = useState(initial?.brand_id ?? '')
  const [manufacturerId, setManufacturerId] = useState(initial?.manufacturer_id ?? '')
  const [formulaId, setFormulaId] = useState('')

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
  const [suggesting, setSuggesting] = useState(false)

  // Load manufacturers + formulas
  useEffect(() => {
    const sb = createClient()
    sb.from('manufacturers').select('id, code, name').eq('is_active', true).order('code')
      .then(({ data }) => { if (data) setManufacturers(data as Manufacturer[]) })
    sb.from('manufacturer_formulas').select('id, code, name, manufacturer_id').eq('is_active', true).order('code')
      .then(({ data }) => { if (data) setFormulas(data as Formula[]) })
  }, [])

  // If editing, find the formula this product is linked to
  useEffect(() => {
    if (!initial?.id) return
    const sb = createClient()
    sb.from('formula_products').select('formula_id').eq('product_id', initial.id).limit(1)
      .then(({ data }) => { if (data?.[0]) setFormulaId(data[0].formula_id) })
  }, [initial?.id])

  // If editing, find manufacturer_id from product
  useEffect(() => {
    if (!initial?.id || manufacturerId) return
    const sb = createClient()
    sb.from('products').select('manufacturer_id').eq('id', initial.id).single()
      .then(({ data }) => { if (data?.manufacturer_id) setManufacturerId(data.manufacturer_id) })
  }, [initial?.id, manufacturerId])

  // Filter formulas by selected manufacturer
  const filteredFormulas = manufacturerId
    ? formulas.filter(f => f.manufacturer_id === manufacturerId)
    : []

  // Auto-suggest code
  async function handleSuggestCode() {
    const brand = brands.find(b => b.id === brandId)
    const mfr = manufacturers.find(m => m.id === manufacturerId)
    if (!brand || !mfr) return
    setSuggesting(true)
    try {
      const suggested = await suggestProductCode(brand.code, mfr.code)
      setCode(suggested)
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')

    const payload = {
      code, name, unit,
      brand_id:            brandId || null,
      manufacturer_id:     manufacturerId || null,
      manufacturer:        manufacturers.find(m => m.id === manufacturerId)?.name ?? null,
      formula_id:          formulaId || null,
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

    const result = isEdit
      ? await updateProduct(initial!.id!, payload)
      : await createProduct(payload)

    if (result?.error) { setError(result.error); setSaving(false); return }
    router.refresh(); onDone()
  }

  const inp = 'h-8 text-sm'
  const sel = 'w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Step 1: Brand + Nhà máy ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          ① Brand &amp; Nhà máy
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Brand</Label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={sel}>
              <option value="">— Chọn brand —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>[{b.code}] {b.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Nhà máy SX</Label>
            <select
              value={manufacturerId}
              onChange={(e) => { setManufacturerId(e.target.value); setFormulaId('') }}
              className={sel}
            >
              <option value="">— Chọn nhà máy —</option>
              {manufacturers.map((m) => <option key={m.id} value={m.id}>[{m.code}] {m.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Step 2: Công thức (nếu có) ── */}
      {filteredFormulas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            ② Công thức nhà máy
          </p>
          <div className="space-y-1">
            <Label>Công thức gốc</Label>
            <select value={formulaId} onChange={(e) => setFormulaId(e.target.value)} className={sel}>
              <option value="">— Không liên kết —</option>
              {filteredFormulas.map(f => (
                <option key={f.id} value={f.id}>[{f.code}] {f.name}</option>
              ))}
            </select>
            {formulaId && (
              <p className="text-xs text-green-600 mt-1">
                Giá chất nhà máy sẽ tự đồng bộ khi có bảng giá mới.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: Mã hàng + Tên ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {filteredFormulas.length > 0 ? '③' : '②'} Thông tin sản phẩm
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Mã sản phẩm <span className="text-red-500">*</span></Label>
            <div className="flex gap-1">
              <Input className={inp} value={code} onChange={(e) => setCode(e.target.value)} required placeholder="RL-PK-001" />
              {!isEdit && brandId && manufacturerId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 shrink-0"
                  onClick={handleSuggestCode}
                  disabled={suggesting}
                  title="Tự sinh mã"
                >
                  <Wand2 className="size-4" />
                </Button>
              )}
            </div>
            {!isEdit && brandId && manufacturerId && (
              <p className="text-[10px] text-gray-400">
                Bấm <Wand2 className="size-3 inline" /> để tự sinh mã theo quy tắc Brand-NM-STT
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Đơn vị <span className="text-red-500">*</span></Label>
            <Input className={inp} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Chai / Hộp / kg" required />
          </div>
          <div className="space-y-1">
            <Label>Brand</Label>
            <div className="flex items-center h-8">
              {brandId ? (
                <Badge variant="secondary">{brands.find(b => b.id === brandId)?.name ?? '—'}</Badge>
              ) : (
                <span className="text-xs text-gray-400">Chọn ở trên</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1 mt-3">
          <Label>Tên sản phẩm <span className="text-red-500">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="VD: Remplir Serum B5 30ml" />
        </div>
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
        {formulaId && (
          <p className="text-xs text-blue-500 mt-2">
            Giá chất sẽ tự cập nhật từ bảng giá nhà máy khi có báo giá mới.
          </p>
        )}
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
