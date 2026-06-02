'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  parseSalesInvoiceFiles,
  commitSalesInvoiceImport,
  type SalesInvoiceParseResult,
} from '../actions'

type SimpleOption    = { id: string; name: string }
type ProjectOption   = { id: string; code: string; name: string; company_id: string }
type WarehouseOption = { id: string; code: string; name: string }
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

export function SalesInvoiceXmlImporter({ companies, projects, warehouses, products, users }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing]     = useState(false)
  const [committing, setCommitting] = useState(false)
  const [results, setResults]     = useState<SalesInvoiceParseResult[]>([])
  const [error, setError]         = useState('')

  const [perInvoice, setPerInvoice] = useState<{
    [idx: number]: {
      company_id:   string
      project_id:   string
      warehouse_id: string
      nhan_su:      string
      product_ids:  (string | null)[]
      customer_action: 'use_existing' | 'create_new' | 'skip'
      new_customer_code: string
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

    const res = await parseSalesInvoiceFiles(fd)
    setParsing(false)
    if (res.error) { setError(res.error); return }
    if (!res.data) return

    setResults(res.data)

    const initState: typeof perInvoice = {}
    res.data.forEach((inv, idx) => {
      initState[idx] = {
        company_id: companies[0]?.id ?? '',
        project_id: '',
        warehouse_id: '',
        nhan_su: '',
        product_ids: inv.product_matches.map(p => p.product_id),
        customer_action: inv.customer_match ? 'use_existing' : 'create_new',
        new_customer_code: 'KH-' + (inv.buyer_tax_code ?? Date.now().toString().slice(-6)),
        committed: false,
      }
    })
    setPerInvoice(initState)
  }

  async function commitOne(idx: number) {
    const inv = results[idx]
    const ctrl = perInvoice[idx]
    if (!ctrl || ctrl.committed) return
    if (!ctrl.company_id) {
      setPerInvoice(p => ({ ...p, [idx]: { ...ctrl, commit_error: 'Chọn công ty' } }))
      return
    }

    setCommitting(true)
    const res = await commitSalesInvoiceImport({
      parsed: inv,
      company_id: ctrl.company_id,
      project_id: ctrl.project_id || null,
      warehouse_id: ctrl.warehouse_id || null,
      nhan_su_thuc_hien: ctrl.nhan_su || null,
      item_product_ids: ctrl.product_ids,
      existing_customer_id: ctrl.customer_action === 'use_existing' ? inv.customer_match?.id : null,
      create_customer: ctrl.customer_action === 'create_new'
        ? {
            code: ctrl.new_customer_code,
            name: inv.buyer_name ?? 'KH mới',
            tax_code: inv.buyer_tax_code ?? '',
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
      <form onSubmit={handleUpload} className="rounded-xl border bg-white p-4 space-y-3">
        <div className="space-y-1">
          <Label>File XML hóa đơn bán ra (chuẩn TT 78/2021)</Label>
          <Input ref={inputRef} type="file"
            accept=".xml,application/xml,text/xml" multiple className="cursor-pointer" />
          <p className="text-xs text-gray-500">
            Xuất từ phần mềm hóa đơn điện tử (Misa/Viettel/VNPT/Easyinvoice/FPT).
            Có thể upload nhiều file 1 lần.
          </p>
        </div>
        <Button type="submit" disabled={parsing}>
          {parsing ? 'Đang đọc…' : 'Đọc XML'}
        </Button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

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
                ctrl.committed ? 'border-green-300 bg-green-50' :
                ctrl.commit_error ? 'border-red-300 bg-red-50' :
                'border-gray-200 bg-white'
              } p-4 space-y-3`}>

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
                      KH: <b>{inv.buyer_name ?? '—'}</b>
                      <span className="text-xs text-gray-400 ml-1">[MST {inv.buyer_tax_code ?? '—'}]</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      Người bán (mình): {inv.supplier_name ?? '—'} [MST {inv.supplier_tax_code ?? '—'}]
                    </p>
                  </div>
                  {ctrl.committed && <span className="text-sm text-green-700 font-medium">✓ Đã tạo</span>}
                </div>

                {inv.warnings.length > 0 && (
                  <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    ⚠ {inv.warnings.join(' · ')}
                  </div>
                )}

                {!ctrl.committed && (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Công ty (ta) *</Label>
                        <select value={ctrl.company_id} onChange={(e) => updateCtrl(idx, { company_id: e.target.value })}
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
                        <Label className="text-xs">Kho xuất hàng</Label>
                        <select value={ctrl.warehouse_id} onChange={(e) => updateCtrl(idx, { warehouse_id: e.target.value })}
                          className="w-full h-8 rounded border border-input bg-white px-2 text-xs">
                          <option value="">— Không trừ kho —</option>
                          {warehouses.map(w => <option key={w.id} value={w.id}>[{w.code}] {w.name}</option>)}
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

                    {/* Customer resolution */}
                    <div className="rounded bg-slate-50 border px-3 py-2">
                      <Label className="text-xs font-semibold">Khách hàng (Người mua)</Label>
                      {inv.customer_match ? (
                        <p className="text-sm text-green-700 mt-1">
                          ✓ Đã match: <b>{inv.customer_match.name}</b> [{inv.customer_match.code}]
                        </p>
                      ) : (
                        <div className="mt-1 space-y-2">
                          <p className="text-xs text-amber-700">⚠ MST chưa có trong hệ thống — sẽ tự tạo KH mới:</p>
                          <div className="flex gap-2 items-center">
                            <Input value={ctrl.new_customer_code}
                              onChange={(e) => updateCtrl(idx, { new_customer_code: e.target.value })}
                              placeholder="Mã KH mới" className="h-7 text-xs w-40" />
                            <span className="text-xs text-gray-500">{inv.buyer_name}</span>
                            <label className="ml-auto text-xs flex items-center gap-1">
                              <input type="radio" checked={ctrl.customer_action === 'create_new'}
                                onChange={() => updateCtrl(idx, { customer_action: 'create_new' })} />
                              Tạo mới
                            </label>
                            <label className="text-xs flex items-center gap-1">
                              <input type="radio" checked={ctrl.customer_action === 'skip'}
                                onChange={() => updateCtrl(idx, { customer_action: 'skip' })} />
                              Bỏ qua
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Items */}
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
                      <Button size="sm" onClick={() => commitOne(idx)} disabled={committing || ctrl.customer_action === 'skip'}>
                        Tạo đơn bán ra này
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
