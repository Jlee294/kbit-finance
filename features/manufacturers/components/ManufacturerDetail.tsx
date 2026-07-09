'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PAGE_WRAPPER, LIST_WRAP, LIST_THEAD, LIST_ROW, FORM_GRID, DIALOG_SM, DIALOG_MD } from '@/lib/ui-tokens'
import {
  createFormula, updateFormula, deleteFormula,
  linkProductToFormula, unlinkProductFromFormula,
  createManufacturerPrice, updateManufacturerPrice, deleteManufacturerPrice,
} from '../actions'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, Link2, Unlink, ChevronDown, ChevronRight, FlaskConical } from 'lucide-react'
import type { FormulaRow, ManufacturerPriceRow } from '../queries'

const CURR_SYMBOL: Record<string, string> = { KRW: '₩', VND: 'đ', USD: '$' }

interface Manufacturer {
  id: string; code: string; name: string; country: string
  phone: string | null; email: string | null; address: string | null; note: string | null
}

interface Product { id: string; code: string; name: string; unit: string }

export function ManufacturerDetail({ manufacturer, formulas, prices, canWrite }: {
  manufacturer: Manufacturer
  formulas: FormulaRow[]
  prices: ManufacturerPriceRow[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])

  // Formula dialog
  const [formulaOpen, setFormulaOpen] = useState(false)
  const [editingFormula, setEditingFormula] = useState<FormulaRow | null>(null)

  // Price dialog
  const [priceOpen, setPriceOpen] = useState(false)
  const [editingPrice, setEditingPrice] = useState<ManufacturerPriceRow | null>(null)
  const [priceFormulaId, setPriceFormulaId] = useState('')

  // Link product dialog
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkFormulaId, setLinkFormulaId] = useState('')

  // Expanded formulas
  const [expanded, setExpanded] = useState<Set<string>>(new Set(formulas.map(f => f.id)))

  useEffect(() => {
    const sb = createClient()
    sb.from('products').select('id, code, name, unit').eq('is_active', true).order('code')
      .then(({ data }) => { if (data) setProducts(data as Product[]) })
  }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openCreateFormula() { setEditingFormula(null); setFormulaOpen(true) }
  function openEditFormula(f: FormulaRow) { setEditingFormula(f); setFormulaOpen(true) }

  function openCreatePrice(formulaId: string) {
    setEditingPrice(null); setPriceFormulaId(formulaId); setPriceOpen(true)
  }
  function openEditPrice(p: ManufacturerPriceRow) {
    setEditingPrice(p); setPriceFormulaId(p.formula_id); setPriceOpen(true)
  }

  function openLinkProduct(formulaId: string) {
    setLinkFormulaId(formulaId); setLinkOpen(true)
  }

  async function handleDeleteFormula(id: string) {
    if (!confirm('Xóa công thức này và tất cả bảng giá liên quan?')) return
    await deleteFormula(id)
    router.refresh()
  }

  async function handleDeletePrice(id: string) {
    if (!confirm('Xóa dòng giá này?')) return
    await deleteManufacturerPrice(id)
    router.refresh()
  }

  async function handleUnlink(formulaId: string, productId: string) {
    if (!confirm('Gỡ liên kết sản phẩm này khỏi công thức?')) return
    await unlinkProductFromFormula(formulaId, productId)
    router.refresh()
  }

  const pricesByFormula = new Map<string, ManufacturerPriceRow[]>()
  for (const p of prices) {
    if (!pricesByFormula.has(p.formula_id)) pricesByFormula.set(p.formula_id, [])
    pricesByFormula.get(p.formula_id)!.push(p)
  }

  const COUNTRY: Record<string, string> = { KR: 'Hàn Quốc', VN: 'Việt Nam', CN: 'Trung Quốc', JP: 'Nhật Bản', US: 'Hoa Kỳ' }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={manufacturer.name}
        subtitle={`${manufacturer.code} — ${COUNTRY[manufacturer.country] ?? manufacturer.country}`}
        breadcrumb={
          <span className="flex items-center gap-1 text-xs">
            <a href="/danh-muc/nha-may" className="text-primary hover:underline">Nhà máy</a>
            <span>/</span>
            <span>{manufacturer.code}</span>
          </span>
        }
        actions={canWrite ? (
          <Button size="sm" onClick={openCreateFormula}>
            <Plus className="size-4 mr-1" /> Thêm công thức
          </Button>
        ) : undefined}
      />

      {/* Info card */}
      <div className="rounded-xl border bg-white p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-xs text-gray-400 block">Điện thoại</span>
          <span className="text-gray-700">{manufacturer.phone || '—'}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400 block">Email</span>
          <span className="text-gray-700">{manufacturer.email || '—'}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400 block">Địa chỉ</span>
          <span className="text-gray-700">{manufacturer.address || '—'}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400 block">Ghi chú</span>
          <span className="text-gray-700">{manufacturer.note || '—'}</span>
        </div>
      </div>

      {/* Formulas */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Công thức sản xuất ({formulas.length})
        </h3>

        {formulas.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-400">
            Chưa có công thức. {canWrite && 'Bấm "Thêm công thức" để bắt đầu.'}
          </div>
        ) : (
          <div className="space-y-3">
            {formulas.map(f => {
              const fp = pricesByFormula.get(f.id) ?? []
              const isOpen = expanded.has(f.id)
              const latestPrice = fp[0]
              return (
                <div key={f.id} className="rounded-xl border bg-white overflow-hidden">
                  {/* Formula header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleExpand(f.id)}
                  >
                    {isOpen
                      ? <ChevronDown className="size-4 text-gray-400 shrink-0" />
                      : <ChevronRight className="size-4 text-gray-400 shrink-0" />
                    }
                    <FlaskConical className="size-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{f.code}</span>
                        <span className="font-medium text-sm">{f.name}</span>
                        {f.note && <span className="text-xs text-gray-400 truncate">— {f.note}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {f.products.length > 0 ? (
                          f.products.map(p => (
                            <Badge key={p.id} variant="secondary" className="text-[10px] px-1.5">
                              [{p.code}] {p.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-amber-500">Chưa liên kết sản phẩm</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {latestPrice ? (
                        <span className="text-sm font-medium">
                          {CURR_SYMBOL[latestPrice.currency] ?? ''}{latestPrice.unit_price.toLocaleString('vi-VN')} {latestPrice.currency}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Chưa có giá</span>
                      )}
                      <div className="text-[10px] text-gray-400">{fp.length} báo giá</div>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isOpen && (
                    <div className="border-t">
                      {/* Action buttons */}
                      {canWrite && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b">
                          <button
                            onClick={(e) => { e.stopPropagation(); openCreatePrice(f.id) }}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Plus className="size-3" /> Thêm giá
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); openLinkProduct(f.id) }}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Link2 className="size-3" /> Liên kết SP
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditFormula(f) }}
                            className="text-xs text-gray-500 hover:underline flex items-center gap-1"
                          >
                            <Pencil className="size-3" /> Sửa
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteFormula(f.id) }}
                            className="text-xs text-red-500 hover:underline flex items-center gap-1 ml-auto"
                          >
                            <Trash2 className="size-3" /> Xóa
                          </button>
                        </div>
                      )}

                      {/* Linked products */}
                      {f.products.length > 0 && (
                        <div className="px-4 py-2 bg-blue-50/50 border-b">
                          <span className="text-xs font-medium text-gray-500 mr-2">SP liên kết:</span>
                          <div className="inline-flex flex-wrap gap-1.5">
                            {f.products.map(p => (
                              <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-white rounded-lg px-2 py-0.5 border">
                                <span className="font-mono text-gray-500">{p.code}</span>
                                <span>{p.name}</span>
                                <span className="text-gray-400">({p.unit})</span>
                                {canWrite && (
                                  <button
                                    onClick={() => handleUnlink(f.id, p.id)}
                                    className="text-red-400 hover:text-red-600 ml-0.5"
                                    title="Gỡ liên kết"
                                  >
                                    <Unlink className="size-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Price table */}
                      {fp.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 text-xs text-gray-500 uppercase">
                              <tr>
                                <th className="px-4 py-2 text-right">Đơn giá NM</th>
                                <th className="px-4 py-2 text-right">MOQ</th>
                                <th className="px-4 py-2 text-left">Ngày hiệu lực</th>
                                <th className="px-4 py-2 text-center">Bao gồm</th>
                                <th className="px-4 py-2 text-left">Ghi chú</th>
                                {canWrite && <th className="px-4 py-2 w-20" />}
                              </tr>
                            </thead>
                            <tbody>
                              {fp.map((p, i) => (
                                <tr key={p.id} className={`${LIST_ROW} ${i === 0 ? 'bg-green-50/40' : ''}`}>
                                  <td className="px-4 py-2 text-right font-medium">
                                    {CURR_SYMBOL[p.currency] ?? ''}{p.unit_price.toLocaleString('vi-VN')} {p.currency}
                                  </td>
                                  <td className="px-4 py-2 text-right">{p.moq ? p.moq.toLocaleString('vi-VN') : '—'}</td>
                                  <td className="px-4 py-2 text-xs">
                                    {p.effective_date}
                                    {i === 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">Mới nhất</Badge>}
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {p.includes_bottle && <Badge variant="secondary" className="text-[10px] px-1.5">Chai</Badge>}
                                      {p.includes_packaging && <Badge variant="secondary" className="text-[10px] px-1.5">Bao bì</Badge>}
                                      {!p.includes_bottle && !p.includes_packaging && <span className="text-gray-300">—</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate">{p.note || ''}</td>
                                  {canWrite && (
                                    <td className="px-4 py-2 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => openEditPrice(p)} className="p-1 hover:text-primary"><Pencil className="size-3.5" /></button>
                                        <button onClick={() => handleDeletePrice(p.id)} className="p-1 hover:text-red-500"><Trash2 className="size-3.5" /></button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="px-4 py-4 text-center text-gray-400 text-sm">
                          Chưa có bảng giá cho công thức này.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Formula dialog */}
      <Dialog open={formulaOpen} onOpenChange={setFormulaOpen}>
        <DialogContent className={DIALOG_SM}>
          <DialogHeader>
            <DialogTitle>{editingFormula ? 'Sửa công thức' : 'Thêm công thức'}</DialogTitle>
          </DialogHeader>
          <FormulaForm
            manufacturerId={manufacturer.id}
            initial={editingFormula}
            onDone={() => { setFormulaOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>

      {/* Price dialog */}
      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent className={DIALOG_MD}>
          <DialogHeader>
            <DialogTitle>{editingPrice ? 'Sửa giá' : 'Thêm giá'}</DialogTitle>
          </DialogHeader>
          <PriceForm
            manufacturerId={manufacturer.id}
            formulas={formulas}
            formulaId={priceFormulaId}
            initial={editingPrice}
            onDone={() => { setPriceOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>

      {/* Link product dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className={DIALOG_SM}>
          <DialogHeader>
            <DialogTitle>Liên kết sản phẩm</DialogTitle>
          </DialogHeader>
          <LinkProductForm
            formulaId={linkFormulaId}
            products={products}
            linkedIds={new Set(formulas.find(f => f.id === linkFormulaId)?.products.map(p => p.id) ?? [])}
            onDone={() => { setLinkOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Formula Form ───────────────────────────────────────────────────────────────

function FormulaForm({ manufacturerId, initial, onDone }: {
  manufacturerId: string
  initial: FormulaRow | null
  onDone: () => void
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = { manufacturer_id: manufacturerId, code, name, note: note || null }
    const result = initial
      ? await updateFormula(initial.id, payload)
      : await createFormula(payload)
    setSaving(false)
    if (result?.error) { setError(result.error); return }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Mã công thức</Label>
          <Input value={code} onChange={e => setCode(e.target.value)} required placeholder="SERUM-B5" />
        </div>
        <div className="space-y-1">
          <Label>Tên công thức</Label>
          <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Serum B5 Hyaluronic" />
        </div>
        <div className="space-y-1">
          <Label>Ghi chú</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="VD: Dung tích 30ml, 50ml..." />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}

// ── Link Product Form ──────────────────────────────────────────────────────────

function LinkProductForm({ formulaId, products, linkedIds, onDone }: {
  formulaId: string
  products: Product[]
  linkedIds: Set<string>
  onDone: () => void
}) {
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  const filtered = products.filter(p => {
    if (linkedIds.has(p.id)) return false
    const q = search.toLowerCase()
    return !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
  })

  async function handleLink(productId: string) {
    setSaving(productId)
    await linkProductToFormula(formulaId, productId)
    setSaving(null)
    onDone()
  }

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Tìm theo mã hoặc tên sản phẩm..."
        autoFocus
      />
      <div className="max-h-60 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Không tìm thấy sản phẩm</p>
        ) : (
          filtered.map(p => (
            <button
              key={p.id}
              onClick={() => handleLink(p.id)}
              disabled={saving === p.id}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-left text-sm transition-colors disabled:opacity-50"
            >
              <span className="font-mono text-xs text-gray-500 shrink-0">{p.code}</span>
              <span className="flex-1">{p.name}</span>
              <span className="text-xs text-gray-400">{p.unit}</span>
              <Plus className="size-4 text-primary shrink-0" />
            </button>
          ))
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onDone}>Đóng</Button>
      </div>
    </div>
  )
}

// ── Price Form ─────────────────────────────────────────────────────────────────

function PriceForm({ manufacturerId, formulas, formulaId, initial, onDone }: {
  manufacturerId: string
  formulas: FormulaRow[]
  formulaId: string
  initial: ManufacturerPriceRow | null
  onDone: () => void
}) {
  const [fId, setFId] = useState(initial?.formula_id ?? formulaId)
  const [unitPrice, setUnitPrice] = useState(initial ? String(initial.unit_price) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'KRW')
  const [moq, setMoq] = useState(initial?.moq ? String(initial.moq) : '')
  const [effectiveDate, setEffectiveDate] = useState(initial?.effective_date ?? new Date().toISOString().slice(0, 10))
  const [includesBottle, setIncludesBottle] = useState(initial?.includes_bottle ?? false)
  const [includesPackaging, setIncludesPackaging] = useState(initial?.includes_packaging ?? false)
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const sel = 'w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      manufacturer_id: manufacturerId,
      formula_id: fId,
      unit_price: unitPrice,
      currency,
      moq: moq ? Number(moq) : null,
      effective_date: effectiveDate,
      includes_bottle: includesBottle,
      includes_packaging: includesPackaging,
      note: note || null,
    }
    const result = initial
      ? await updateManufacturerPrice(initial.id, payload)
      : await createManufacturerPrice(payload)
    setSaving(false)
    if (result?.error) { setError(result.error); return }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={FORM_GRID}>
        <div className="sm:col-span-2 space-y-1">
          <Label>Công thức</Label>
          <select value={fId} onChange={e => setFId(e.target.value)} required className={sel}>
            <option value="">— Chọn công thức —</option>
            {formulas.map(f => <option key={f.id} value={f.id}>[{f.code}] {f.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Đơn giá nhà máy</Label>
          <Input type="number" min="0" step="any" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} required placeholder="15000" />
        </div>
        <div className="space-y-1">
          <Label>Loại tiền</Label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} className={sel}>
            <option value="KRW">KRW (₩)</option>
            <option value="VND">VND (đ)</option>
            <option value="USD">USD ($)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>MOQ (SL tối thiểu)</Label>
          <Input type="number" min="0" value={moq} onChange={e => setMoq(e.target.value)} placeholder="1000" />
        </div>
        <div className="space-y-1">
          <Label>Ngày hiệu lực</Label>
          <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} required />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label>Giá đã bao gồm</Label>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includesBottle} onChange={e => setIncludesBottle(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm">Chai / lọ</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includesPackaging} onChange={e => setIncludesPackaging(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm">Bao bì / đóng gói</span>
            </label>
          </div>
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label>Ghi chú</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="VD: Giá bulk trên 5000 chai, chưa gồm nhãn mác..." />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
