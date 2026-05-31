'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProductForm } from './ProductForm'
import { BrandForm } from '@/features/brands/components/BrandForm'
import type { Brand } from '@/features/brands/queries'
import type { ProductRow, ExchangeRates } from '../queries'

// ── Currency helpers ──────────────────────────────────────────────────────────

const CURR_SYMBOL: Record<string, string> = { VND: 'đ', KRW: '₩', USD: '$' }

function formatAmt(val: number, curr: string) {
  if (curr === 'VND') return val.toLocaleString('vi-VN') + ' đ'
  if (curr === 'KRW') return val.toLocaleString('ko-KR') + ' ₩'
  if (curr === 'USD') return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2 })
  return val.toLocaleString() + ' ' + curr
}

function toVND(amount: number | null, curr: string, rates: ExchangeRates): number | null {
  if (amount == null || amount === 0) return null
  const rate = rates[curr] ?? (curr === 'VND' ? 1 : null)
  if (rate == null) return null
  return Math.round(amount * rate)
}

function fmtVND(v: number) {
  return v.toLocaleString('vi-VN') + ' đ'
}

function CostCell({
  amount, curr, rates,
}: { amount: number | null; curr: string; rates: ExchangeRates }) {
  if (amount == null || amount === 0) return <span className="text-gray-300">—</span>
  const vnd = toVND(amount, curr, rates)
  return (
    <div className="text-right leading-tight">
      <p className="text-gray-800 text-xs font-medium">{formatAmt(amount, curr)}</p>
      {curr !== 'VND' && vnd != null && (
        <p className="text-[10px] text-gray-400">≈ {fmtVND(vnd)}</p>
      )}
      {curr !== 'VND' && vnd == null && (
        <p className="text-[10px] text-amber-500">chưa có tỷ giá</p>
      )}
    </div>
  )
}

function computeGiaVon(row: ProductRow, rates: ExchangeRates): number | null {
  const costs = [
    { amt: row.cost_material,  curr: row.cost_material_curr  },
    { amt: row.cost_bottle,    curr: row.cost_bottle_curr    },
    { amt: row.cost_packaging, curr: row.cost_packaging_curr },
    { amt: row.cost_shipping,  curr: row.cost_shipping_curr  },
  ]
  let total = 0
  let hasAny = false
  for (const c of costs) {
    if (c.amt == null) continue
    hasAny = true
    const vnd = toVND(c.amt, c.curr, rates)
    if (vnd == null) return null   // missing rate → can't compute
    total += vnd
  }
  return hasAny ? total : null
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  brands:   Brand[]
  products: ProductRow[]
  rates:    ExchangeRates
  canWrite: boolean
}

type DialogMode = 'none' | 'addProduct' | 'editProduct' | 'addBrand' | 'editBrand'

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductCatalog({ brands, products, rates, canWrite }: Props) {
  const router = useRouter()
  const [activeBrandId, setActiveBrandId] = useState<string>('all')
  const [dialog,        setDialog]        = useState<DialogMode>('none')
  const [editProduct,   setEditProduct]   = useState<ProductRow | undefined>()
  const [editBrand,     setEditBrand]     = useState<Brand | undefined>()

  // ── Filtered products ─────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    activeBrandId === 'all'
      ? products
      : products.filter((p) => p.brand_id === activeBrandId),
  [products, activeBrandId])

  // ── Brand product count ───────────────────────────────────────────────────
  const brandCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of products) {
      if (p.brand_id) m[p.brand_id] = (m[p.brand_id] ?? 0) + 1
    }
    return m
  }, [products])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function openEditProduct(p: ProductRow) { setEditProduct(p); setDialog('editProduct') }
  function openEditBrand(b: Brand)        { setEditBrand(b);   setDialog('editBrand')   }
  function closeDialog()                  { setDialog('none'); router.refresh() }

  // ── Active brand name ─────────────────────────────────────────────────────
  const activeBrand = brands.find((b) => b.id === activeBrandId)

  return (
    <div className="space-y-5 p-6">

      {/* ─ Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sản phẩm</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} sản phẩm
            {activeBrand ? ` · ${activeBrand.name}` : ` · ${brands.length} brand`}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditBrand(undefined); setDialog('addBrand') }}>
              + Brand
            </Button>
            <Button size="sm" onClick={() => { setEditProduct(undefined); setDialog('addProduct') }}>
              + Sản phẩm
            </Button>
          </div>
        )}
      </div>

      {/* ─ Brand tabs ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveBrandId('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
            activeBrandId === 'all'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}
        >
          Tất cả <span className="ml-1 text-xs opacity-70">({products.length})</span>
        </button>

        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => setActiveBrandId(b.id)}
            className={`group px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              activeBrandId === b.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-700'
            }`}
          >
            {b.name}
            <span className="ml-1 text-xs opacity-70">({brandCount[b.id] ?? 0})</span>
            {canWrite && activeBrandId === b.id && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); openEditBrand(b) }}
                className="ml-1.5 opacity-70 hover:opacity-100"
                title="Sửa brand"
              >✎</span>
            )}
          </button>
        ))}
      </div>

      {/* ─ Rates info ──────────────────────────────────────────────────── */}
      {(rates.KRW || rates.USD) && (
        <div className="flex gap-4 text-xs text-gray-400">
          {rates.KRW && <span>1 ₩ = {rates.KRW.toLocaleString('vi-VN')} đ</span>}
          {rates.USD && <span>1 $ = {rates.USD.toLocaleString('vi-VN')} đ</span>}
          {!rates.KRW && <span className="text-amber-500">⚠ Chưa có tỷ giá KRW → VND</span>}
          {!rates.USD && <span className="text-amber-500">⚠ Chưa có tỷ giá USD → VND</span>}
        </div>
      )}

      {/* ─ Product table ───────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            Chưa có sản phẩm nào{activeBrandId !== 'all' ? ' trong brand này' : ''}.
          </div>
        ) : (
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-3 text-left w-[8%]">Mã</th>
                <th className="px-3 py-3 text-left w-[14%]">Tên sản phẩm</th>
                <th className="px-3 py-3 text-left w-[6%]">ĐVT</th>
                <th className="px-3 py-3 text-right w-[10%]">Giá chất</th>
                <th className="px-3 py-3 text-right w-[10%]">Chai lọ</th>
                <th className="px-3 py-3 text-right w-[10%]">Bao bì</th>
                <th className="px-3 py-3 text-right w-[10%]">Vận chuyển</th>
                <th className="px-3 py-3 text-right w-[12%] bg-amber-50 text-amber-700">Giá vốn</th>
                <th className="px-3 py-3 text-right w-[10%]">Niêm yết KR</th>
                <th className="px-3 py-3 text-right w-[10%]">Niêm yết VN</th>
                {canWrite && <th className="px-3 py-3 w-[6%]"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => {
                const giaVon = computeGiaVon(p, rates)
                return (
                  <tr key={p.id} className="hover:bg-gray-50 group">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs text-gray-600">{p.code}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900 leading-snug">{p.name}</p>
                      {p.brand && activeBrandId === 'all' && (
                        <p className="text-[10px] text-blue-500">{p.brand.name}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{p.unit}</td>

                    <td className="px-3 py-2.5">
                      <CostCell amount={p.cost_material}  curr={p.cost_material_curr}  rates={rates} />
                    </td>
                    <td className="px-3 py-2.5">
                      <CostCell amount={p.cost_bottle}    curr={p.cost_bottle_curr}    rates={rates} />
                    </td>
                    <td className="px-3 py-2.5">
                      <CostCell amount={p.cost_packaging} curr={p.cost_packaging_curr} rates={rates} />
                    </td>
                    <td className="px-3 py-2.5">
                      <CostCell amount={p.cost_shipping}  curr={p.cost_shipping_curr}  rates={rates} />
                    </td>

                    {/* Giá vốn */}
                    <td className="px-3 py-2.5 bg-amber-50">
                      {giaVon != null ? (
                        <p className="text-right font-semibold text-amber-800 text-xs">
                          {fmtVND(giaVon)}
                        </p>
                      ) : (
                        <p className="text-right text-xs text-gray-300">—</p>
                      )}
                    </td>

                    {/* Giá niêm yết KR */}
                    <td className="px-3 py-2.5">
                      {p.price_list_kr != null ? (
                        <div className="text-right leading-tight">
                          <p className="text-xs font-medium text-gray-800">
                            {p.price_list_kr.toLocaleString('ko-KR')} ₩
                          </p>
                          {rates.KRW && (
                            <p className="text-[10px] text-gray-400">
                              ≈ {fmtVND(Math.round(p.price_list_kr * rates.KRW))}
                            </p>
                          )}
                        </div>
                      ) : <span className="text-gray-300 text-xs float-right">—</span>}
                    </td>

                    {/* Giá niêm yết VN */}
                    <td className="px-3 py-2.5 text-right">
                      {p.price_list_vn != null ? (
                        <p className="text-xs font-medium text-gray-800">{fmtVND(p.price_list_vn)}</p>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {canWrite && (
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => openEditProduct(p)}
                          className="text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Sửa
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─ Add/Edit Product dialog ─────────────────────────────────────── */}
      <Dialog
        open={dialog === 'addProduct' || dialog === 'editProduct'}
        onOpenChange={(o) => { if (!o) setDialog('none') }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'editProduct' ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm mới'}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            initial={editProduct}
            brands={brands}
            onDone={closeDialog}
          />
        </DialogContent>
      </Dialog>

      {/* ─ Add/Edit Brand dialog ───────────────────────────────────────── */}
      <Dialog
        open={dialog === 'addBrand' || dialog === 'editBrand'}
        onOpenChange={(o) => { if (!o) setDialog('none') }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'editBrand' ? 'Cập nhật brand' : 'Thêm brand mới'}
            </DialogTitle>
          </DialogHeader>
          <BrandForm
            initial={editBrand}
            onDone={closeDialog}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
