'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseInvoiceFiles, commitInvoiceImport, type InvoiceParseResult } from '../actions'

type SimpleOption    = { id: string; name: string }
type ProjectOption   = { id: string; code: string; name: string; company_id: string }
type WarehouseOption = { id: string; code: string; name: string; company_id?: string }
type ProductOption   = { id: string; code: string; name: string }
type UserOption      = { id: string; name: string }

interface Props {
  companies:  SimpleOption[]
  projects:   ProjectOption[]
  warehouses: WarehouseOption[]
  products:   ProductOption[]
  users:      UserOption[]
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + ' đ' }

export function InvoiceXmlImporter({ companies, projects, warehouses, products, users }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing]     = useState(false)
  const [committing, setCommitting] = useState(false)
  const [results, setResults]     = useState<InvoiceParseResult[]>([])
  const [error, setError]         = useState('')

  // Per-invoice user choices
  const [perInvoice, setPerInvoice] = useState<{
    [idx: number]: {
      company_id:   string
      project_id:   string
      warehouse_id: string
      nhan_su:      string
      product_ids:  (string | null)[]
      supplier_action: 'use_existing' | 'create_new' | 'skip'
      new_supplier_code: string
      committed: boolean
      commit_error?: string
    }
  }>({})

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!inputRef.current?.files?.length) { setError('Chọn file XML'); return }
    setParsing(true); setError(''); setResults([])

    const fd = new FormData()
    Array.from(inputRef.current.files).forEach(f => fd.append('files', f))

    const res = await parseInvoiceFiles(fd)
    setParsing(false)
    if (res.error) { setError(res.error); return }
    if (!res.data) return

    setResults(res.data)

    // init per-invoice state
    const initState: typeof perInvoice = {}
    res.data.forEach((inv, idx) => {
      initState[idx] = {
        company_id: companies[0]?.id ?? '',
        project_id: '',
        warehouse_id: '',
        nhan_su: '',
        product_ids: inv.product_matches.map(p => p.product_id),
        supplier_action: inv.supplier_match ? 'use_existing' : 'create_new',
        new_supplier_code: 'NCC-' + (inv.supplier_tax_code ?? Date.now().toString().slice(-6)),
        committed: false,
      }
    })
    setPerInvoice(initState)
  }

  async function commitOne(idx: number) {
    const inv = results[idx]
    const ctrl = perInvoice[idx]
    if (!ctrl) return
    if (ctrl.committed) return
    if (!ctrl.company_id) {
      setPerInvoice(p => ({ ...p, [idx]: { ...ctrl, commit_error: 'Chọn công ty' } }))
      return
    }

    setCommitting(true)
    const res = await commitInvoiceImport({
      parsed: inv,
      company_id: ctrl.company_id,
      project_id: ctrl.project_id || null,
      warehouse_id: ctrl.warehouse_id || null,
      nhan_su_thuc_hien: ctrl.nhan_su || null,
      item_product_ids: ctrl.product_ids,
      existing_supplier_id: ctrl.supplier_action === 'use_existing' ? inv.supplier_match?.id : null,
      create_supplier: ctrl.supplier_action === 'create_new'
        ? {
            code: ctrl.new_supplier_code,
            name: inv.supplier_name ?? 'NCC mới',
            tax_code: inv.supplier_tax_code ?? '',
            country: 'VN',
          }
        : null,
    })
    setCommitting(false)

    if (res.error) {
      setPerInvoice(p => ({ ...p, [idx]: { ...ctrl, commit_error: res.error } }))
    } else {
      setPerInvoice(p => ({ ...p, [idx]: { ...ctrl, committed: true, commit_error: undefined } }))
      router.refresh()
    }
  }

  async function commitAll() {
    for (let i = 0; i < results.length; i++) {
      if (!perInvoice[i]?.committed) await commitOne(i)
    }
  }

  function updateCtrl(idx: number, patch: Partial<NonNullable<typeof perInvoice[0]>>) {
    setPerInvoice(p => ({ ...p, [idx]: { ...p[idx]!, ...patch } }))
  }

  return (
    <div className="space-y-5">
      {/* ─ Upload ──────────────────────────────────────────────────────── */}
      <form onSubmit={handleUpload} className="rounded-xl border bg-white p-4 space-y-3">
        <div className="space-y-1">
          <Label>File XML hóa đơn (chuẩn TT 78/2021)</Label>
          <Input
            ref={inputRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            multiple
            className="cursor-pointer"
          />
          <p className="text-xs text-gray-500">Có thể chọn nhiều file 1 lần — hỗ trợ Misa/Viettel/VNPT/Easyinvoice/FPT.</p>
        </div>
        <Button type="submit" disabled={parsing}>
          {parsing ? 'Đang đọc…' : 'Đọc XML'}
        </Button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {/* ─ Results ─────────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Đã đọc <b>{results.length}</b> hóa đơn. Kiểm tra rồi bấm "Tạo" hoặc "Tạo tất cả".
            </p>
            <Button onClick={commitAll} disabled={committing}
              className="bg-brand-800 hover:bg-brand-700">
              {committing ? 'Đang tạo…' : `Tạo tất cả (${results.filter((_, i) => !perInvoice[i]?.committed).length})`}
            </Button>
          </div>

          {results.map((inv, idx) => {
            const ctrl = perInvoice[idx]
            if (!ctrl) return null
            return (
              <div key={idx} className={`rounded-xl border-2 ${
                ctrl.committed ? 'border-brand-300 bg-brand-50' :
                ctrl.commit_error ? 'border-red-300 bg-red-50' :
                'border-gray-200 bg-white'
              } p-4 space-y-3`}>

                {/* Header info */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400">{inv.raw_filename}</p>
                    <h3 className="font-semibold text-gray-900">
                      HĐ {inv.invoice_symbol ?? '—'}/{inv.invoice_no ?? '—'}
                      <span className="ml-3 text-sm text-gray-500 font-normal">
                        {inv.invoice_date} · {fmtVND(inv.grand_total)}
                      </span>
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {inv.supplier_name} <span className="text-xs text-gray-400">[MST {inv.supplier_tax_code ?? '—'}]</span>
                    </p>
                  </div>
                  {ctrl.committed && <span className="text-sm text-brand-700 font-medium">✓ Đã tạo</span>}
                </div>

                {/* Warnings */}
                {inv.warnings.length > 0 && (
                  <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    ⚠ {inv.warnings.join(' · ')}
                  </div>
                )}

                {!ctrl.committed && (
                  <>
                    {/* Mapping fields */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Công ty (ta) *</Label>
                        <select value={ctrl.company_id} onChange={(e) => updateCtrl(idx, { company_id: e.target.value, warehouse_id: '' })}
                          className="w-full h-8 rounded border border-input bg-white px-2 text-xs">
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Dự án</Label>
                        <select value={ctrl.project_id} onChange={(e) => updateCtrl(idx, { project_id: e.target.value })}
                          className="w-full h-8 rounded border border-input bg-white px-2 text-xs">
                          <option value="">—</option>
                          {projects.filter(p => !ctrl.company_id || p.company_id === ctrl.company_id).map(p =>
                            <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Kho nhập</Label>
                        <select value={ctrl.warehouse_id} onChange={(e) => updateCtrl(idx, { warehouse_id: e.target.value })}
                          className="w-full h-8 rounded border border-input bg-white px-2 text-xs">
                          <option value="">— Không nhập kho —</option>
                          {warehouses.filter(w => !ctrl.company_id || w.company_id === ctrl.company_id).map(w =>
                            <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Nhân sự thực hiện</Label>
                        <select value={ctrl.nhan_su} onChange={(e) => updateCtrl(idx, { nhan_su: e.target.value })}
                          className="w-full h-8 rounded border border-input bg-white px-2 text-xs">
                          <option value="">—</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Supplier resolution */}
                    <div className="rounded bg-slate-50 border px-3 py-2">
                      <Label className="text-xs font-semibold">NCC (Người bán)</Label>
                      {inv.supplier_match ? (
                        <p className="text-sm text-brand-700 mt-1">
                          ✓ Đã match: <b>{inv.supplier_match.name}</b> [{inv.supplier_match.code}]
                        </p>
                      ) : (
                        <div className="mt-1 space-y-2">
                          <p className="text-xs text-amber-700">⚠ MST chưa có trong hệ thống — sẽ tự tạo NCC mới:</p>
                          <div className="flex gap-2 items-center">
                            <Input value={ctrl.new_supplier_code}
                              onChange={(e) => updateCtrl(idx, { new_supplier_code: e.target.value })}
                              placeholder="Mã NCC mới" className="h-7 text-xs w-40" />
                            <span className="text-xs text-gray-500">{inv.supplier_name}</span>
                            <label className="ml-auto text-xs flex items-center gap-1">
                              <input type="radio" checked={ctrl.supplier_action === 'create_new'}
                                onChange={() => updateCtrl(idx, { supplier_action: 'create_new' })} />
                              Tạo mới
                            </label>
                            <label className="text-xs flex items-center gap-1">
                              <input type="radio" checked={ctrl.supplier_action === 'skip'}
                                onChange={() => updateCtrl(idx, { supplier_action: 'skip' })} />
                              Bỏ qua HĐ này
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Items table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr className="text-[10px] text-gray-500 uppercase">
                            <th className="px-2 py-1.5 text-left">Tên hàng (theo XML)</th>
                            <th className="px-2 py-1.5 text-left">SP trong hệ thống</th>
                            <th className="px-2 py-1.5 text-right">SL</th>
                            <th className="px-2 py-1.5 text-right">Đơn giá</th>
                            <th className="px-2 py-1.5 text-right">Thành tiền</th>
                            <th className="px-2 py-1.5 text-right">VAT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {inv.items.map((it, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1.5 text-gray-700">{it.name}</td>
                              <td className="px-2 py-1.5">
                                <select value={ctrl.product_ids[i] ?? ''}
                                  onChange={(e) => {
                                    const newIds = [...ctrl.product_ids]
                                    newIds[i] = e.target.value || null
                                    updateCtrl(idx, { product_ids: newIds })
                                  }}
                                  className="w-full h-7 rounded border border-input bg-white px-1 text-[11px]">
                                  <option value="">— Không khớp SP (chỉ mô tả) —</option>
                                  {products.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
                                </select>
                              </td>
                              <td className="px-2 py-1.5 text-right">{it.qty}</td>
                              <td className="px-2 py-1.5 text-right">{fmtVND(it.unit_price)}</td>
                              <td className="px-2 py-1.5 text-right font-medium">{fmtVND(it.amount)}</td>
                              <td className="px-2 py-1.5 text-right text-brand-800">{fmtVND(it.vat_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 font-semibold">
                          <tr>
                            <td colSpan={4} className="px-2 py-1.5 text-right">Tổng:</td>
                            <td className="px-2 py-1.5 text-right">{fmtVND(inv.subtotal)}</td>
                            <td className="px-2 py-1.5 text-right text-brand-800">{fmtVND(inv.vat_amount)}</td>
                          </tr>
                          <tr>
                            <td colSpan={5} className="px-2 py-1.5 text-right">Tổng cộng:</td>
                            <td className="px-2 py-1.5 text-right text-base">{fmtVND(inv.grand_total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {ctrl.commit_error && (
                      <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{ctrl.commit_error}</p>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => commitOne(idx)} disabled={committing || ctrl.supplier_action === 'skip'}>
                        Tạo hóa đơn này
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
