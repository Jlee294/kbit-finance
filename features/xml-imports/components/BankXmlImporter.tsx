'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseBankXmlFile, commitBankTxns, type BankParseResult } from '../actions'

type SimpleOption    = { id: string; name: string }
type BankOption      = { id: string; name: string; company_id: string; currency: string }
type CustomerOption  = { id: string; code: string; name: string }
type SupplierOption  = { id: string; code: string; name: string }

interface Props {
  companies: SimpleOption[]
  banks:     BankOption[]
  customers: CustomerOption[]
  suppliers: SupplierOption[]
}

function fmt(v: number) { return v.toLocaleString('vi-VN') }

export function BankXmlImporter({ companies, banks, customers, suppliers }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<BankParseResult | null>(null)
  const [error, setError] = useState('')

  const [bankId, setBankId] = useState('')
  const [companyId, setCompanyId] = useState('')

  // Per-txn: include + customer/supplier + direction override
  const [perTxn, setPerTxn] = useState<Record<number, {
    include: boolean
    direction: 'thu' | 'chi'
    customer_id: string
    supplier_id: string
    note: string
  }>>({})

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    if (!inputRef.current?.files?.[0]) { setError('Chọn file'); return }
    setParsing(true); setError(''); setResult(null)

    const fd = new FormData()
    fd.append('file', inputRef.current.files[0])

    const res = await parseBankXmlFile(fd)
    setParsing(false)
    if (res.error) { setError(res.error); return }
    if (!res.data) return

    setResult(res.data)
    if (res.data.bank_account_match) {
      setBankId(res.data.bank_account_match.id)
      setCompanyId(res.data.bank_account_match.company_id)
    }

    const init: typeof perTxn = {}
    res.data.txns.forEach((t, i) => {
      init[i] = {
        include: true,
        direction: t.credit > 0 ? 'thu' : 'chi',
        customer_id: '',
        supplier_id: '',
        note: t.description,
      }
    })
    setPerTxn(init)
  }

  async function handleCommit() {
    if (!result || !bankId || !companyId) { setError('Chọn TK ngân hàng + công ty'); return }
    setCommitting(true)
    const txns = result.txns
      .map((t, i) => ({ t, i }))
      .filter(({ i }) => perTxn[i]?.include)
      .map(({ t, i }) => ({
        txn_date:    t.txn_date,
        description: t.description,
        debit:       t.debit,
        credit:      t.credit,
        reference:   t.reference,
        direction:   perTxn[i].direction,
        customer_id: perTxn[i].customer_id || null,
        supplier_id: perTxn[i].supplier_id || null,
        note:        perTxn[i].note,
      }))

    const res = await commitBankTxns({
      bank_account_id: bankId,
      company_id: companyId,
      txns,
    })
    setCommitting(false)
    if (res.error) setError(res.error)
    else if (res.data) {
      alert(`Đã tạo ${res.data.created} giao dịch · Bỏ qua ${res.data.skipped}`)
      router.refresh()
      setResult(null)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleParse} className="rounded-xl border bg-white p-4 space-y-3">
        <div className="space-y-1">
          <Label>File XML sao kê (Techcombank)</Label>
          <Input ref={inputRef} type="file" accept=".xml,application/xml,text/xml" className="cursor-pointer" />
          <p className="text-xs text-gray-500">Xuất từ Techcom Business → Báo cáo → Sao kê → Định dạng XML.</p>
        </div>
        <Button type="submit" disabled={parsing}>{parsing ? 'Đang đọc…' : 'Đọc XML'}</Button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="rounded-xl border-2 border-gray-200 bg-white p-4 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-400">{result.raw_filename}</p>
              <h3 className="font-semibold">
                {result.account_number ? `Số TK: ${result.account_number}` : 'Không tìm thấy số TK'}
                <span className="ml-3 text-sm text-gray-500 font-normal">
                  {result.currency} · {result.txns.length} giao dịch
                </span>
              </h3>
              {result.duplicate_count > 0 && (
                <p className="text-xs text-amber-600 mt-1">⚠ {result.duplicate_count} giao dịch có thể trùng với DB</p>
              )}
            </div>
            <div className="flex gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Công ty *</Label>
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                  className="h-8 rounded border border-input bg-white px-2 text-xs min-w-[160px]">
                  <option value="">—</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TK ngân hàng *</Label>
                <select value={bankId} onChange={(e) => setBankId(e.target.value)}
                  className="h-8 rounded border border-input bg-white px-2 text-xs min-w-[200px]">
                  <option value="">—</option>
                  {banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
                </select>
              </div>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ {result.warnings.join(' · ')}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="bg-gray-50">
                <tr className="text-[10px] text-gray-500 uppercase">
                  <th className="px-2 py-2 text-center w-[40px]"><input type="checkbox" checked
                    onChange={(e) => {
                      const c = e.target.checked
                      setPerTxn(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, include: c }])))
                    }} /></th>
                  <th className="px-2 py-2 text-left">Ngày</th>
                  <th className="px-2 py-2 text-left">Diễn giải</th>
                  <th className="px-2 py-2 text-right">Chi (Nợ)</th>
                  <th className="px-2 py-2 text-right">Thu (Có)</th>
                  <th className="px-2 py-2 text-center">Loại</th>
                  <th className="px-2 py-2 text-left">KH / NCC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.txns.map((t, i) => {
                  const ctrl = perTxn[i]
                  if (!ctrl) return null
                  return (
                    <tr key={i} className={ctrl.include ? '' : 'opacity-40'}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={ctrl.include}
                          onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, include: e.target.checked } }))} />
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">{t.txn_date}</td>
                      <td className="px-2 py-1.5 text-gray-700">
                        <input value={ctrl.note}
                          onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, note: e.target.value } }))}
                          className="w-full h-6 rounded border-0 bg-transparent px-1 text-[11px] hover:bg-gray-50 focus:bg-white focus:border" />
                      </td>
                      <td className="px-2 py-1.5 text-right text-red-600">{t.debit > 0 ? fmt(t.debit) : ''}</td>
                      <td className="px-2 py-1.5 text-right text-green-700">{t.credit > 0 ? fmt(t.credit) : ''}</td>
                      <td className="px-2 py-1.5 text-center">
                        <select value={ctrl.direction}
                          onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, direction: e.target.value as 'thu' | 'chi' } }))}
                          className="h-6 rounded border border-input bg-white px-1 text-[11px]">
                          <option value="thu">Thu</option>
                          <option value="chi">Chi</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        {ctrl.direction === 'thu' ? (
                          <select value={ctrl.customer_id}
                            onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, customer_id: e.target.value } }))}
                            className="w-full h-6 rounded border border-input bg-white px-1 text-[11px]">
                            <option value="">— Chọn KH —</option>
                            {customers.map(c => <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>)}
                          </select>
                        ) : (
                          <select value={ctrl.supplier_id}
                            onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, supplier_id: e.target.value } }))}
                            className="w-full h-6 rounded border border-input bg-white px-1 text-[11px]">
                            <option value="">— Chọn NCC —</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>[{s.code}] {s.name}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={handleCommit} disabled={committing || !bankId || !companyId}
              className="bg-green-600 hover:bg-green-700">
              {committing ? 'Đang tạo…' : `Tạo ${Object.values(perTxn).filter(x => x.include).length} giao dịch`}
            </Button>
          </div>

          <p className="text-xs text-gray-500">
            Lưu ý: Phiếu thu được tạo với <code>is_unassigned=true</code> — bạn cần vào <b>Thu tiền</b> để phân bổ vào đơn hàng.
          </p>
        </div>
      )}
    </div>
  )
}
