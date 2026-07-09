'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PAGE_WRAPPER, LIST_WRAP, LIST_THEAD, LIST_ROW, FORM_GRID, DIALOG_MD } from '@/lib/ui-tokens'
import { createManufacturerPrice, updateManufacturerPrice, deleteManufacturerPrice } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { ManufacturerPriceRow } from '../queries'

const CURR_SYMBOL: Record<string, string> = { KRW: '₩', VND: 'đ', USD: '$' }

interface Manufacturer {
  id: string; code: string; name: string; country: string
  phone: string | null; email: string | null; address: string | null; note: string | null
}

interface Product { id: string; code: string; name: string; unit: string }

export function ManufacturerDetail({ manufacturer, prices, canWrite }: {
  manufacturer: Manufacturer
  prices: ManufacturerPriceRow[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ManufacturerPriceRow | null>(null)
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const sb = createClient()
    sb.from('products').select('id, code, name, unit').eq('is_active', true).order('code')
      .then(({ data }) => { if (data) setProducts(data as Product[]) })
  }, [])

  function openCreate() { setEditing(null); setOpen(true) }
  function openEdit(p: ManufacturerPriceRow) { setEditing(p); setOpen(true) }

  async function handleDelete(id: string) {
    if (!confirm('Xóa dòng giá này?')) return
    await deleteManufacturerPrice(id)
    router.refresh()
  }

  // Group prices by product for display
  const byProduct = new Map<string, ManufacturerPriceRow[]>()
  for (const p of prices) {
    const key = p.product_id
    if (!byProduct.has(key)) byProduct.set(key, [])
    byProduct.get(key)!.push(p)
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={manufacturer.name}
        subtitle={`${manufacturer.code} — ${manufacturer.country === 'KR' ? 'Hàn Quốc' : manufacturer.country}`}
        breadcrumb={
          <span className="flex items-center gap-1 text-xs">
            <a href="/danh-muc/nha-may" className="text-primary hover:underline">Nhà máy</a>
            <span>/</span>
            <span>{manufacturer.code}</span>
          </span>
        }
        actions={canWrite ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-1" /> Thêm giá sản phẩm
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

      {/* Price table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Bảng giá sản phẩm ({prices.length} dòng, {byProduct.size} sản phẩm)
        </h3>

        {prices.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-400">
            Chưa có bảng giá. {canWrite && 'Bấm "Thêm giá sản phẩm" để bắt đầu.'}
          </div>
        ) : (
          <div className={`${LIST_WRAP} overflow-x-auto`}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead className={LIST_THEAD}>
                <tr>
                  <th className="px-4 py-2.5 text-left">Mã hàng</th>
                  <th className="px-4 py-2.5 text-left">Tên sản phẩm</th>
                  <th className="px-4 py-2.5 text-left">ĐVT</th>
                  <th className="px-4 py-2.5 text-right">Đơn giá NM</th>
                  <th className="px-4 py-2.5 text-right">MOQ</th>
                  <th className="px-4 py-2.5 text-left">Ngày hiệu lực</th>
                  <th className="px-4 py-2.5 text-center">Bao gồm</th>
                  <th className="px-4 py-2.5 text-left">Ghi chú</th>
                  {canWrite && <th className="px-4 py-2.5 w-20" />}
                </tr>
              </thead>
              <tbody>
                {prices.map((p, i) => {
                  const isFirstOfProduct = i === 0 || prices[i - 1].product_id !== p.product_id
                  return (
                    <tr key={p.id} className={`${LIST_ROW} ${isFirstOfProduct ? 'border-t-2 border-slate-200' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-xs">{p.product_code}</td>
                      <td className="px-4 py-2.5">{p.product_name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{p.product_unit}</td>
                      <td className="px-4 py-2.5 text-right font-medium">
                        {CURR_SYMBOL[p.currency] ?? ''}{p.unit_price.toLocaleString('vi-VN')} {p.currency}
                      </td>
                      <td className="px-4 py-2.5 text-right">{p.moq ? p.moq.toLocaleString('vi-VN') : '—'}</td>
                      <td className="px-4 py-2.5 text-xs">{p.effective_date}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {p.includes_bottle && <Badge variant="secondary" className="text-[10px] px-1.5">Chai</Badge>}
                          {p.includes_packaging && <Badge variant="secondary" className="text-[10px] px-1.5">Bao bì</Badge>}
                          {!p.includes_bottle && !p.includes_packaging && <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-[200px] truncate">{p.note || ''}</td>
                      {canWrite && (
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(p)} className="p-1 hover:text-primary"><Pencil className="size-3.5" /></button>
                            <button onClick={() => handleDelete(p.id)} className="p-1 hover:text-red-500"><Trash2 className="size-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Price form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={DIALOG_MD}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa giá sản phẩm' : 'Thêm giá sản phẩm'}</DialogTitle>
          </DialogHeader>
          <PriceForm
            manufacturerId={manufacturer.id}
            products={products}
            initial={editing}
            onDone={() => { setOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PriceForm({ manufacturerId, products, initial, onDone }: {
  manufacturerId: string
  products: Product[]
  initial: ManufacturerPriceRow | null
  onDone: () => void
}) {
  const [productId, setProductId] = useState(initial?.product_id ?? '')
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
      product_id: productId,
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
          <Label>Sản phẩm</Label>
          <select value={productId} onChange={e => setProductId(e.target.value)} required className={sel}>
            <option value="">— Chọn sản phẩm —</option>
            {products.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
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
