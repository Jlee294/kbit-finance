'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND, formatKRW, todayLocal } from '@/lib/format'
import { allocateUnitCost } from '../cost'
import { createImportOrder, updateImportOrder } from '../actions'
import type { ImportOrderDetail } from '../queries'
import { FormSection } from '@/components/shared/FormSection'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { QuickProductForm } from '@/features/products/components/QuickProductForm'
import { QuickAddPartnerDialog } from '@/features/partners/components/QuickAddPartnerDialog'
import { DIALOG_SM } from '@/lib/ui-tokens'
import { toast } from 'sonner'

type SimpleOption  = { id: string; name: string }
type SupplierOpt   = { id: string; code: string; name: string }
type ProductOpt    = { id: string; code: string; name: string; unit?: string | null }
type ProjectOpt    = { id: string; code: string; name: string; company_id: string }
type UserOpt       = { id: string; name: string }
type WarehouseOpt  = { id: string; code: string; name: string; company_id?: string; is_default?: boolean }

type OperationOpt = { id: string; code: string; name: string; group_name: string | null }

interface Props {
  companies:   SimpleOption[]
  suppliers:   SupplierOpt[]
  products:    ProductOpt[]
  projects:    ProjectOpt[]
  users?:      UserOpt[]
  warehouses?: WarehouseOpt[]
  operations?: OperationOpt[]   // KTT D3: nghiệp vụ → checklist HS
  editOrder?:  ImportOrderDetail | null
  onDone:      () => void
}

interface ItemRow {
  product_id:  string
  description: string
  qty:         string
  unit_price:  string
  lot_no:      string   // KTT G
  expiry_date: string   // KTT G — YYYY-MM-DD hoặc ''
}
const newRow = (): ItemRow => ({ product_id: '', description: '', qty: '', unit_price: '', lot_no: '', expiry_date: '' })

const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

// Chọn kho mặc định (kho chính) của công ty trong danh sách kho đã nạp.
function pickDefaultWarehouse(warehouses: WarehouseOpt[], companyId: string): string {
  if (!companyId) return ''
  const list = warehouses.filter((w) => w.company_id === companyId)
  if (list.length === 0) return ''
  return (list.find((w) => w.is_default) ?? list[0]).id
}

export function ImportOrderForm({ companies, suppliers, products, projects, users = [], warehouses = [], operations = [], editOrder, onDone }: Props) {
  const router = useRouter()
  const isEdit = !!editOrder

  const [companyId,       setCompanyId]       = useState(editOrder?.company_id ?? '')
  const [supplierId,      setSupplierId]      = useState(editOrder?.supplier_id ?? '')
  const [quickSupOpen,    setQuickSupOpen]    = useState(false)
  const [extraSuppliers,  setExtraSuppliers]  = useState<SupplierOpt[]>([])
  const [operationId,     setOperationId]     = useState<string>((editOrder as any)?.operation_id ?? '')
  const [projectId,       setProjectId]       = useState(editOrder?.project_id ?? '')
  const [orderCode,       setOrderCode]       = useState(editOrder?.order_code ?? '')
  const [orderDate,       setOrderDate]       = useState(editOrder?.order_date ?? todayLocal())
  const [orderType,       setOrderType]       = useState<'import' | 'domestic'>((editOrder?.order_type as 'import' | 'domestic') ?? 'import')
  const [currency,        setCurrency]        = useState<'VND' | 'KRW'>((editOrder?.currency as 'VND' | 'KRW') ?? 'VND')
  const [exchangeRate,    setExchangeRate]    = useState(editOrder?.exchange_rate ? String(editOrder.exchange_rate) : '')
  const [goodsValue,      setGoodsValue]      = useState(editOrder ? String(editOrder.goods_value) : '')
  const [importDuty,      setImportDuty]      = useState(editOrder ? String(editOrder.import_duty) : '0')
  const [vatImport,       setVatImport]       = useState(editOrder ? String(editOrder.vat_import) : '0')
  const [otherFees,       setOtherFees]       = useState(editOrder ? String(editOrder.other_fees) : '0')
  const [isInterco,       setIsInterco]       = useState(editOrder?.is_intercompany ?? false)
  const [counterpartId,   setCounterpartId]   = useState(editOrder?.counterpart_company_id ?? '')

  // Hóa đơn
  const [invoiceTemplate,  setInvoiceTemplate]  = useState(editOrder?.invoice_template  ?? '')
  const [invoiceSymbol,    setInvoiceSymbol]    = useState(editOrder?.invoice_symbol    ?? '')
  const [invoiceNo,        setInvoiceNo]        = useState(editOrder?.invoice_no        ?? '')
  const [invoiceDate,      setInvoiceDate]      = useState(editOrder?.invoice_date      ?? '')
  const [supplierTaxCode,  setSupplierTaxCode]  = useState(editOrder?.supplier_tax_code ?? '')
  const [vatAmount,        setVatAmount]        = useState(editOrder?.vat_amount != null ? String(editOrder.vat_amount) : '')
  const [dinhKhoanNo,      setDinhKhoanNo]      = useState(editOrder?.dinh_khoan_no     ?? '')
  const [dinhKhoanCo,      setDinhKhoanCo]      = useState(editOrder?.dinh_khoan_co     ?? '')
  const [nhanSuId,         setNhanSuId]         = useState(editOrder?.nhan_su_thuc_hien ?? '')
  const [warehouseId,      setWarehouseId]      = useState<string>(() =>
    editOrder?.warehouse_id ?? pickDefaultWarehouse(warehouses, editOrder?.company_id ?? ''))

  const [items, setItems] = useState<ItemRow[]>(
    editOrder?.supplier_order_items?.length
      ? editOrder.supplier_order_items.map((it: any) => ({
          product_id:  it.product_id ?? '',
          description: it.description ?? '',
          qty:         String(it.qty),
          unit_price:  String(it.unit_price),
          lot_no:      it.lot_no ?? '',
          expiry_date: it.expiry_date ?? '',
        }))
      : [newRow()],
  )

  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)
  const [productList, setProductList] = useState<ProductOpt[]>(products)
  const [quickOpen, setQuickOpen] = useState(false)

  const filteredProjects = companyId ? projects.filter((p) => p.company_id === companyId) : projects
  const counterpartList  = companies.filter((c) => c.id !== companyId)
  // C-1: kho phải thuộc công ty đang chọn (tồn/giá vốn suy công ty TỪ kho).
  const filteredWarehouses = companyId ? warehouses.filter((w) => w.company_id === companyId) : warehouses

  // ── Preview giá vốn (client-side, hàm thuần)
  const gv   = parseFloat(goodsValue) || 0
  const duty = parseFloat(importDuty) || 0
  const vat  = parseFloat(vatImport)  || 0
  const fees = parseFloat(otherFees)  || 0
  const rate = currency === 'KRW' ? (parseFloat(exchangeRate) || 0) : 1
  const costTotalFc  = gv + duty + fees          // KHÔNG gồm vat_import
  const costTotalVnd = costTotalFc * (currency === 'KRW' ? rate : 1)
  const parsedItems  = items.map((r) => ({ qty: parseFloat(r.qty) || 0, unit_price: parseFloat(r.unit_price) || 0 }))
  const previewUnitCosts = costTotalVnd > 0 ? allocateUnitCost(parsedItems, costTotalVnd) : []

  function updateItem(i: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addItem() { setItems((prev) => [...prev, newRow()]) }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload = {
        company_id:   companyId,
        supplier_id:  supplierId,
        project_id:   projectId || null,
        order_code:   orderCode.trim() || null,
        order_date:   orderDate,
        order_type:   orderType,
        currency,
        exchange_rate: currency === 'KRW' ? parseFloat(exchangeRate) : null,
        goods_value:  gv,
        import_duty:  duty,
        vat_import:   vat,
        other_fees:   fees,
        is_intercompany:        isInterco,
        counterpart_company_id: isInterco ? counterpartId : null,
        // Hóa đơn
        invoice_template:  invoiceTemplate  || null,
        invoice_symbol:    invoiceSymbol    || null,
        invoice_no:        invoiceNo        || null,
        invoice_date:      invoiceDate      || null,
        supplier_tax_code: supplierTaxCode  || null,
        vat_amount:        vatAmount ? parseFloat(vatAmount) : null,
        dinh_khoan_no:     dinhKhoanNo      || null,
        dinh_khoan_co:     dinhKhoanCo      || null,
        nhan_su_thuc_hien: nhanSuId         || null,
        warehouse_id:      warehouseId      || null,
        operation_id:      operationId      || null,
        items: items.map((r) => ({
          product_id:  r.product_id || null,
          description: r.description || null,
          qty:         parseFloat(r.qty),
          unit_price:  parseFloat(r.unit_price) || 0,
          lot_no:      r.lot_no || null,
          expiry_date: r.expiry_date || null,
        })),
      }
      if (isEdit) {
        await updateImportOrder(editOrder.id, payload)
      } else {
        await createImportOrder(payload)
      }
      router.refresh()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  const fmtCurrency = (n: number) => currency === 'KRW' ? formatKRW(n) : formatVND(n)

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────── */}
      {/* KTT I1: full-width dialog → có thể dùng 3 cột trên màn rộng */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Công ty <span className="text-red-500">*</span></Label>
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setProjectId(''); setWarehouseId(pickDefaultWarehouse(warehouses, e.target.value)) }} required className={sel}>
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Nhà cung cấp <span className="text-red-500">*</span></Label>
          <div className="flex gap-2">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required className={sel + ' flex-1'}>
              <option value="">— Chọn NCC —</option>
              {[...extraSuppliers, ...suppliers].map((s) => <option key={s.id} value={s.id}>[{s.code}] {s.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setQuickSupOpen(true)}
              className="h-9 px-3 rounded-md border border-brand-200 bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-medium whitespace-nowrap"
              title="Thêm nhanh NCC mới"
            >+ Mới</button>
          </div>
        </div>
        <QuickAddPartnerDialog
          kind={orderType === 'import' && currency === 'KRW' ? 'supplier_kr' : 'supplier_vn'}
          open={quickSupOpen}
          onClose={() => setQuickSupOpen(false)}
          onCreated={(p) => {
            setExtraSuppliers((prev) => [{ id: p.id, code: p.code, name: p.name }, ...prev])
            setSupplierId(p.id)
          }}
        />
        <div className="space-y-1">
          <Label>Mã đơn <span className="text-xs text-gray-400 font-normal">(để trống = tự sinh)</span></Label>
          <Input value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="Để trống để tự sinh" />
        </div>
        <div className="space-y-1">
          <Label>Ngày đặt hàng <span className="text-red-500">*</span></Label>
          <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Dự án</Label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
            <option value="">— Không có —</option>
            {filteredProjects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
          </select>
        </div>
        {users.length > 0 && (
          <div className="space-y-1">
            <Label>Nhân sự thực hiện</Label>
            <select value={nhanSuId} onChange={(e) => setNhanSuId(e.target.value)} className={sel}>
              <option value="">— Không gán —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        {companyId && filteredWarehouses.length > 0 && (
          <div className="space-y-1">
            <Label>Kho nhập hàng <span className="text-xs text-gray-400 font-normal">(tự cộng tồn theo mã hàng)</span></Label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={sel}>
              {filteredWarehouses.map((w) => <option key={w.id} value={w.id}>[{w.code}] {w.name}{w.is_default ? ' (kho chính)' : ''}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Loại đơn <span className="text-red-500">*</span></Label>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as 'import' | 'domestic')} className={sel}>
            <option value="import">Nhập khẩu</option>
            <option value="domestic">Mua trong nước</option>
          </select>
        </div>

        {/* KTT D3: Nghiệp vụ → checklist hồ sơ */}
        {operations.length > 0 && (
          <div className="space-y-1">
            <Label>Nghiệp vụ <span className="text-xs text-gray-400 font-normal">(checklist HS)</span></Label>
            <select value={operationId} onChange={(e) => setOperationId(e.target.value)} className={sel}>
              <option value="">— Không gắn —</option>
              {operations.map((o) => (
                <option key={o.id} value={o.id}>
                  [{o.code}] {o.name}{o.group_name ? ` · ${o.group_name}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Đơn vị tiền <span className="text-red-500">*</span></Label>
          <select value={currency} onChange={(e) => { setCurrency(e.target.value as 'VND' | 'KRW'); setExchangeRate('') }} className={sel}>
            <option value="VND">VNĐ</option>
            <option value="KRW">KRW (Hàn Quốc)</option>
          </select>
        </div>

        {/* C4/D4: tỷ giá chỉ hiện khi KRW */}
        {currency === 'KRW' && (
          <div className="space-y-1 md:col-span-2">
            <Label>
              Tỷ giá ghi nợ (KRW→VNĐ) <span className="text-red-500">*</span>
            </Label>
            <Input type="number" min="0.001" step="0.001"
              value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)}
              placeholder="VD: 18" required={currency === 'KRW'} />
            <p className="text-xs text-gray-400">Phase 4 dùng để tính chênh lệch tỷ giá khi trả NCC</p>
          </div>
        )}
      </div>

      {/* ── Chi phí nhập khẩu ─────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Chi phí nhập khẩu ({currency})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label>Giá mua hàng <span className="text-red-500">*</span></Label>
            <Input type="number" min="0" step="1"
              value={goodsValue} onChange={(e) => setGoodsValue(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Thuế nhập khẩu</Label>
            <Input type="number" min="0" step="1" value={importDuty} onChange={(e) => setImportDuty(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>VAT khâu nhập khẩu</Label>
            <Input type="number" min="0" step="1" value={vatImport} onChange={(e) => setVatImport(e.target.value)} />
            <p className="text-xs text-brand-700">Khấu trừ riêng — KHÔNG tính vào giá vốn</p>
          </div>
          <div className="space-y-1">
            <Label>Phí khác</Label>
            <Input type="number" min="0" step="1" value={otherFees} onChange={(e) => setOtherFees(e.target.value)} />
            <p className="text-xs text-gray-400">HQ, lưu kho, vận chuyển, đại lý</p>
          </div>
        </div>

        {/* Preview giá vốn */}
        {costTotalFc > 0 && (
          <div className="mt-3 rounded-lg bg-brand-50 border border-brand-100 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between font-semibold text-brand-900">
              <span>Giá vốn lô (cost_total = mua + thuế NK + phí khác):</span>
              <span>{fmtCurrency(costTotalFc)}</span>
            </div>
            {currency === 'KRW' && rate > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>Quy VNĐ (×{rate}):</span>
                <span>{formatVND(costTotalVnd)}</span>
              </div>
            )}
            {vat > 0 && (
              <div className="flex justify-between text-gray-500 text-xs">
                <span>VAT khâu NK (riêng, không vào giá vốn):</span>
                <span>{fmtCurrency(vat)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Dòng hàng ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Dòng hàng</h3>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setQuickOpen(true)}>+ Tạo mã hàng</Button>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>+ Thêm dòng</Button>
          </div>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs">
                <th className="px-3 py-2 text-left">Sản phẩm</th>
                <th className="px-3 py-2 text-left w-32">Mô tả</th>
                <th className="px-3 py-2 text-right w-20">Số lượng</th>
                <th className="px-3 py-2 text-right w-28">Đơn giá ({currency})</th>
                <th className="px-3 py-2 text-right w-28">Thành tiền</th>
                <th className="px-3 py-2 text-left w-24">Số lô</th>
                <th className="px-3 py-2 text-left w-32">HSD (exp)</th>
                <th className="px-3 py-2 text-right w-28">
                  Giá vốn/đv (VNĐ)
                  <span className="block text-gray-400 font-normal">unit_cost</span>
                </th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((row, i) => {
                const lineTotal = (parseFloat(row.qty) || 0) * (parseFloat(row.unit_price) || 0)
                const uc        = previewUnitCosts[i] ?? 0
                // KTT G: highlight HSD nếu dưới 1 năm hoặc sắp hết
                const exp = row.expiry_date ? new Date(row.expiry_date) : null
                const daysLeft = exp ? Math.round((exp.getTime() - Date.now()) / 86_400_000) : null
                const expClass = daysLeft == null ? '' :
                  daysLeft < 0   ? 'border-red-400 text-red-700 font-medium' :
                  daysLeft < 90  ? 'border-red-300' :
                  daysLeft < 365 ? 'border-amber-300' : ''
                return (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <select value={row.product_id} onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-xs focus:outline-none">
                        <option value="">— Chọn SP —</option>
                        {productList.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Input value={row.description} onChange={(e) => updateItem(i, 'description', e.target.value)}
                        placeholder="Mô tả..." className="h-8 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" min="0.001" step="0.001" value={row.qty}
                        onChange={(e) => updateItem(i, 'qty', e.target.value)}
                        className="h-8 text-xs text-right" required />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" min="0" step="1" value={row.unit_price}
                        onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                        className="h-8 text-xs text-right" />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700">
                      {lineTotal > 0 ? fmtCurrency(lineTotal) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Input value={row.lot_no} onChange={(e) => updateItem(i, 'lot_no', e.target.value)}
                        placeholder="VD: L2024-A" className="h-8 text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="date" value={row.expiry_date} onChange={(e) => updateItem(i, 'expiry_date', e.target.value)}
                        className={`h-8 text-xs ${expClass}`} />
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-medium text-brand-800">
                      {uc > 0 ? formatVND(uc) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(i)}
                          className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          💡 <strong>Số lô + HSD:</strong> để trống nếu mặt hàng không có lô/HSD. HSD &lt; 1 năm sẽ highlight cam, &lt; 3 tháng đỏ.
        </p>
      </div>

      {/* ── Thông tin hóa đơn ────────────────────────────────────── */}
      <FormSection title="Thông tin hóa đơn" description="Cho bảng kê mua vào" variant="elevated">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Ký hiệu mẫu HĐ</Label>
            <Input value={invoiceTemplate} onChange={(e) => setInvoiceTemplate(e.target.value)} placeholder="VD: 1/001" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ký hiệu HĐ</Label>
            <Input value={invoiceSymbol} onChange={(e) => setInvoiceSymbol(e.target.value)} placeholder="VD: AA/24E" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số HĐ</Label>
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="VD: 0000123" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ngày HĐ</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">MST NCC</Label>
            <Input value={supplierTaxCode} onChange={(e) => setSupplierTaxCode(e.target.value)} placeholder="VD: 0123456789" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tiền VAT</Label>
            <Input type="number" min="0" step="any" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} placeholder="0" className="h-8 text-sm text-right" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Định khoản Nợ</Label>
            <Input value={dinhKhoanNo} onChange={(e) => setDinhKhoanNo(e.target.value)} placeholder="156 / 152..." className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Định khoản Có</Label>
            <Input value={dinhKhoanCo} onChange={(e) => setDinhKhoanCo(e.target.value)} placeholder="331" className="h-8 text-sm" />
          </div>
        </div>
      </FormSection>

      {/* ── Giao dịch nội bộ ──────────────────────────────────────── */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input id="isIntercoImp" type="checkbox" checked={isInterco}
            onChange={(e) => { setIsInterco(e.target.checked); if (!e.target.checked) setCounterpartId('') }}
            className="h-4 w-4 rounded border-gray-300" />
          <Label htmlFor="isIntercoImp" className="cursor-pointer font-medium">
            Giao dịch nội bộ (mua từ công ty trong Group — loại trừ khi hợp nhất)
          </Label>
        </div>
        {isInterco && (
          <div className="pl-6 space-y-1">
            <Label>Pháp nhân đối ứng <span className="text-red-500">*</span></Label>
            <select value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}
              required={isInterco} className={sel}>
              <option value="">— Chọn công ty —</option>
              {counterpartList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật đơn' : (orderType === 'domestic' ? 'Tạo đơn mua trong nước' : 'Tạo đơn nhập khẩu')}
        </Button>
      </div>
    </form>

    <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
      <DialogContent showCloseButton={false} className={DIALOG_SM}>
        <DialogHeader>
          <DialogTitle>Tạo mã hàng mới</DialogTitle>
        </DialogHeader>
        <QuickProductForm
          onDone={() => setQuickOpen(false)}
          onCreated={(p) => {
            setProductList((prev) => [{ id: p.id, code: p.code, name: p.name, unit: p.unit }, ...prev])
            toast.success(`Đã tạo mã hàng [${p.code}] ${p.name}`)
          }}
        />
      </DialogContent>
    </Dialog>
    </>
  )
}
