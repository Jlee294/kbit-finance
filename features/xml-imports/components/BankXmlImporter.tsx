'use client'

import { useState, useRef, useMemo } from 'react'
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
function fmtDiff(v: number) { return (v >= 0 ? '+' : '') + v.toLocaleString('vi-VN') }

export function BankXmlImporter({ companies, banks, customers, suppliers }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<BankParseResult | null>(null)
  const [error, setError] = useState('')

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

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

  /** Tìm KH/NCC khớp tên đối ứng (substring match) */
  function findMatch(counterpart: string | null, list: { id: string; name: string }[]): string {
    if (!counterpart) return ''
    const cp = counterpart.toLowerCase()
    const hit = list.find(x => cp.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(cp.slice(0, 20)))
    return hit?.id ?? ''
  }

  function handleFileSelect(file: File | null) {
    setSelectedFile(file)
    setResult(null)
    setError('')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  async function handleParse(e?: React.FormEvent) {
    e?.preventDefault()
    if (!selectedFile) { setError('Chưa chọn file'); return }
    setParsing(true); setError(''); setResult(null)

    const fd = new FormData()
    fd.append('file', selectedFile)

    const res = await parseBankXmlFile(fd)
    setParsing(false)
    if (res.error) { setError(res.error); return }
    if (!res.data) return

    setResult(res.data)
    // Auto-suggest TK ngân hàng nếu file match
    if (res.data.bank_account_match) {
      setBankId(res.data.bank_account_match.id)
      setCompanyId(res.data.bank_account_match.company_id)
    } else {
      // Nếu chỉ có 1 công ty → tự chọn để bớt thao tác
      if (companies.length === 1) setCompanyId(companies[0].id)
      // Nếu chỉ có 1 TK ngân hàng cùng currency → tự chọn
      const matchingBanks = banks.filter(b => b.currency === res.data!.currency)
      if (matchingBanks.length === 1) {
        setBankId(matchingBanks[0].id)
        setCompanyId(matchingBanks[0].company_id)
      }
    }

    const init: typeof perTxn = {}
    res.data.txns.forEach((t, i) => {
      const direction = t.credit > 0 ? 'thu' : 'chi'
      init[i] = {
        include: true,
        direction,
        customer_id: direction === 'thu' ? findMatch(t.counterpart, customers) : '',
        supplier_id: direction === 'chi' ? findMatch(t.counterpart, suppliers) : '',
        note: t.description,
      }
    })
    setPerTxn(init)
  }

  // ── Đối chiếu tự động ─────────────────────────────────────────────────────
  const reconciliation = useMemo(() => {
    if (!result) return null
    const sumDebit  = result.txns.reduce((s, t) => s + t.debit, 0)
    const sumCredit = result.txns.reduce((s, t) => s + t.credit, 0)
    const sumFee    = result.txns.reduce((s, t) => s + (t.fee || 0), 0)
    const sumVat    = result.txns.reduce((s, t) => s + (t.vat || 0), 0)
    const meta      = result.summary

    // Sort txns by date+time ascending để tính running balance
    const sorted = [...result.txns]
      .map((t, idx) => ({ t, idx }))
      .sort((a, b) => {
        const da = a.t.txn_date + ' ' + (a.t.txn_time ?? '23:59:59')
        const db = b.t.txn_date + ' ' + (b.t.txn_time ?? '23:59:59')
        return da < db ? -1 : da > db ? 1 : 0
      })

    // Tính expected balance cho từng dòng
    const rowChecks: Record<number, { ok: boolean; expected: number | null; diff: number | null }> = {}
    let runningBalance = meta.opening_balance ?? null
    for (const { t, idx } of sorted) {
      if (runningBalance === null) {
        rowChecks[idx] = { ok: true, expected: null, diff: null }
        continue
      }
      const expected = runningBalance + t.credit - t.debit - (t.fee || 0) - (t.vat || 0)
      const actual = t.balance
      if (actual === null) {
        rowChecks[idx] = { ok: true, expected, diff: null }
      } else {
        const diff = actual - expected
        rowChecks[idx] = { ok: Math.abs(diff) < 1, expected, diff }
      }
      runningBalance = actual ?? expected
    }

    return {
      sumDebit, sumCredit, sumFee, sumVat,
      meta,
      computed_closing: meta.opening_balance != null ? meta.opening_balance + sumCredit - sumDebit - sumFee - sumVat : null,
      rowChecks,
      totalRowOk: Object.values(rowChecks).filter(c => c.ok).length,
      totalRowFail: Object.values(rowChecks).filter(c => !c.ok).length,
    }
  }, [result])

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

      {/* ─ Drop zone ───────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed transition-colors cursor-pointer
          ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-white hover:bg-gray-50'}
          px-6 py-12 text-center`}
      >
        <div className="flex flex-col items-center gap-3">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5h3.379a2 2 0 011.414.586l1.121 1.121a2 2 0 001.414.586h6.172A2.5 2.5 0 0121 9.793V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7.5z" />
          </svg>
          <h3 className="text-base font-semibold text-gray-900">
            Kéo thả file sao kê vào đây
          </h3>
          <p className="text-sm text-gray-500">Hoặc bấm để chọn file</p>
          <Button type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
            className="bg-brand-800 hover:bg-brand-700">
            Chọn file
          </Button>
          <input ref={inputRef} type="file" className="hidden"
            accept=".xlsx,.xls,.csv,.xml,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/xml,text/xml,application/pdf"
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)} />
          <p className="text-xs text-gray-400">Excel · CSV · XML · PDF</p>
        </div>

        {/* File chip */}
        {selectedFile && (
          <div className="mt-6 mx-auto max-w-md rounded-lg bg-gray-50 border px-4 py-3 flex items-center justify-between"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-gray-400 shrink-0">📄</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleFileSelect(null) }}
              className="text-gray-400 hover:text-red-500 text-sm shrink-0 ml-3" aria-label="Xóa file">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ─ Action button ──────────────────────────────────────────── */}
      {selectedFile && !result && (
        <Button onClick={() => handleParse()} disabled={parsing}
          className="w-full h-12 text-base bg-green-600 hover:bg-green-700 disabled:bg-gray-300">
          {parsing ? 'Đang đọc file...' : 'Bắt đầu đọc'}
        </Button>
      )}

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {/* ─ Summary banner sau khi parse ───────────────────────────── */}
      {result && reconciliation && (
        <SummaryBanner result={result} rec={reconciliation} bankName={banks.find(b => b.id === bankId)?.name} />
      )}

      {result && reconciliation && (
        <div className="rounded-xl border-2 border-gray-200 bg-white p-4 space-y-4">
          {/* Header + TK chọn */}
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
                <Label className="text-xs">Công ty <span className="text-red-500">*</span></Label>
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                  className={`h-8 rounded border bg-white px-2 text-xs min-w-[160px] ${
                    companyId ? 'border-input' : 'border-red-400 ring-1 ring-red-200'
                  }`}>
                  <option value="">— Chọn —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">TK ngân hàng <span className="text-red-500">*</span></Label>
                <select value={bankId} onChange={(e) => setBankId(e.target.value)}
                  className={`h-8 rounded border bg-white px-2 text-xs min-w-[200px] ${
                    bankId ? 'border-input' : 'border-red-400 ring-1 ring-red-200'
                  }`}>
                  <option value="">— Chọn —</option>
                  {banks.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Cảnh báo nếu TK trong file chưa có trong hệ thống */}
          {result.account_number && !result.bank_account_match && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              ⚠ Số TK <b>{result.account_number}</b> trong file chưa có trong danh mục.
              Vui lòng chọn TK ngân hàng phù hợp ở trên,
              hoặc <a href="/danh-muc/tai-khoan-ngan-hang" target="_blank" className="underline font-medium">thêm TK mới</a> rồi tải lại.
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ {result.warnings.join(' · ')}
            </div>
          )}

          {/* ── BẢNG GIAO DỊCH ────────────────────────────────────────── */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-xs min-w-[1500px]">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-[10px] text-gray-500 uppercase">
                  <th className="px-2 py-2 text-center w-[32px]">
                    <input type="checkbox" checked
                      onChange={(e) => {
                        const c = e.target.checked
                        setPerTxn(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, include: c }])))
                      }} />
                  </th>
                  <th className="px-2 py-2 text-left w-[88px]">Ngày GD</th>
                  <th className="px-2 py-2 text-left w-[160px]">Bút toán + Đối ứng</th>
                  <th className="px-2 py-2 text-left w-[280px]">Nội dung (Diễn giải)</th>
                  <th className="px-2 py-2 text-right w-[100px]">Chi (Nợ)</th>
                  <th className="px-2 py-2 text-right w-[100px]">Thu (Có)</th>
                  <th className="px-2 py-2 text-right w-[70px]">Phí</th>
                  <th className="px-2 py-2 text-right w-[70px]">Thuế</th>
                  <th className="px-2 py-2 text-right w-[110px]">Số dư</th>
                  <th className="px-2 py-2 text-center w-[70px]">Đối chiếu</th>
                  <th className="px-2 py-2 text-center w-[64px]">Loại</th>
                  <th className="px-2 py-2 text-left w-[180px]">KH / NCC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.txns.map((t, i) => {
                  const ctrl = perTxn[i]
                  const check = reconciliation.rowChecks[i]
                  if (!ctrl) return null
                  return (
                    <tr key={i} className={`${ctrl.include ? '' : 'opacity-40'} align-top`}>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={ctrl.include}
                          onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, include: e.target.checked } }))} />
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                        {t.txn_date}
                        {t.txn_time && <p className="text-[10px] text-gray-400">{t.txn_time}</p>}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-500 break-all">
                        {t.reference && <div className="font-mono text-brand-800">{t.reference}</div>}
                        {t.counterpart && <div className="text-gray-700 mt-0.5 leading-tight">{t.counterpart}</div>}
                      </td>
                      <td className="px-2 py-2">
                        <textarea
                          value={ctrl.note}
                          onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, note: e.target.value } }))}
                          rows={2}
                          className="w-full min-h-[36px] rounded border-0 bg-transparent px-1 py-0.5 text-[11px] hover:bg-gray-50 focus:bg-white focus:border focus:border-input resize-y whitespace-pre-wrap break-words"
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-red-600 font-medium tabular-nums">
                        {t.debit > 0 ? fmt(t.debit) : ''}
                      </td>
                      <td className="px-2 py-2 text-right text-green-700 font-medium tabular-nums">
                        {t.credit > 0 ? fmt(t.credit) : ''}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-500 tabular-nums text-[10px]">
                        {t.fee > 0 ? fmt(t.fee) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-500 tabular-nums text-[10px]">
                        {t.vat > 0 ? fmt(t.vat) : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-700 tabular-nums">
                        {t.balance != null ? fmt(t.balance) : '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {check.diff === null ? (
                          <span className="text-[10px] text-gray-300">—</span>
                        ) : check.ok ? (
                          <span className="text-xs font-bold text-green-700">OK</span>
                        ) : (
                          <span className="text-[10px] font-medium text-red-600" title={`Chênh ${fmtDiff(check.diff)}`}>
                            ❌ {fmtDiff(check.diff)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <select value={ctrl.direction}
                          onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, direction: e.target.value as 'thu' | 'chi' } }))}
                          className="h-6 rounded border border-input bg-white px-1 text-[11px]">
                          <option value="thu">Thu</option>
                          <option value="chi">Chi</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        {ctrl.direction === 'thu' ? (
                          <select value={ctrl.customer_id}
                            onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, customer_id: e.target.value } }))}
                            className="w-full h-6 rounded border border-input bg-white px-1 text-[11px]">
                            <option value="">— Chưa gán (gắn sau) —</option>
                            {customers.map(c => <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>)}
                          </select>
                        ) : (
                          <select value={ctrl.supplier_id}
                            onChange={(e) => setPerTxn(p => ({ ...p, [i]: { ...ctrl, supplier_id: e.target.value } }))}
                            className="w-full h-6 rounded border border-input bg-white px-1 text-[11px]">
                            <option value="">— Chưa gán (gắn sau) —</option>
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

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              💡 Có thể để trống cột KH/NCC — gán sau ở trang Thu tiền hoặc Chi VN
            </p>
            <div className="flex flex-col items-end gap-1">
              {(!bankId || !companyId) && (
                <p className="text-xs text-red-600 font-medium">
                  ⚠ Chọn Công ty và TK ngân hàng để tiếp tục
                </p>
              )}
              <Button onClick={handleCommit} disabled={committing || !bankId || !companyId}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300">
                {committing ? 'Đang tạo…' : `Tạo ${Object.values(perTxn).filter(x => x.include).length} giao dịch`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-component: Box Đối chiếu Tổng ──────────────────────────────────────

function ReconciliationBox({ rec, currency }: { rec: any; currency: string }) {
  const fmtCur = (v: number) => v.toLocaleString('vi-VN') + ' ' + (currency === 'VND' ? 'đ' : currency)
  const m = rec.meta
  const sumOk = m.total_debit != null && Math.abs(rec.sumDebit - m.total_debit) < 1 &&
                m.total_credit != null && Math.abs(rec.sumCredit - m.total_credit) < 1
  const balOk = m.closing_balance != null && rec.computed_closing != null &&
                Math.abs(rec.computed_closing - m.closing_balance) < 1

  return (
    <div className="rounded-xl border-2 border-brand-200 bg-brand-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-brand-900">
        Đối chiếu với sao kê
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Cột trái: Tổng phát sinh */}
        <div className="space-y-1.5">
          <Row label="Số dư đầu kỳ"           pdf={m.opening_balance} fmt={fmtCur} />
          <Row label="+ Phát sinh tăng (Có)"  app={rec.sumCredit} pdf={m.total_credit} fmt={fmtCur} compare />
          <Row label="− Phát sinh giảm (Nợ)"  app={rec.sumDebit}  pdf={m.total_debit}  fmt={fmtCur} compare />
          {m.total_fee != null && m.total_fee > 0 && (
            <Row label="− Phí" app={rec.sumFee} pdf={m.total_fee} fmt={fmtCur} compare />
          )}
          {m.total_vat != null && m.total_vat > 0 && (
            <Row label="− Thuế" app={rec.sumVat} pdf={m.total_vat} fmt={fmtCur} compare />
          )}
        </div>

        {/* Cột phải: Số dư cuối */}
        <div className="space-y-1.5">
          <Row label="Số dư cuối kỳ (PDF báo)" pdf={m.closing_balance} fmt={fmtCur} />
          <div className="border-t border-brand-200 pt-1.5">
            <Row label="Tính: SDD + Có − Nợ" app={rec.computed_closing} fmt={fmtCur} />
          </div>
          <div className="rounded bg-white px-3 py-2 mt-2">
            <p className="text-xs text-gray-600">Đối chiếu:</p>
            <p className={`text-base font-bold ${balOk ? 'text-green-700' : 'text-red-600'}`}>
              {balOk ? '✓ KHỚP' : '❌ KHÔNG KHỚP'}
              {!balOk && m.closing_balance != null && rec.computed_closing != null &&
                <span className="text-xs ml-2 font-normal">
                  Chênh {fmtDiff(rec.computed_closing - m.closing_balance)}
                </span>
              }
            </p>
          </div>
        </div>
      </div>

      {/* Đối chiếu per-row */}
      <div className="border-t border-brand-200 pt-2 flex items-center gap-4 text-xs">
        <span className="text-gray-600">Đối chiếu từng dòng:</span>
        <span className="text-green-700 font-medium">✓ {rec.totalRowOk} OK</span>
        {rec.totalRowFail > 0 && (
          <span className="text-red-600 font-medium">❌ {rec.totalRowFail} chênh lệch</span>
        )}
        {!sumOk && m.total_debit != null && (
          <span className="text-amber-700">⚠ Tổng app không khớp PDF</span>
        )}
      </div>
    </div>
  )

  function fmtDiff(v: number) { return (v >= 0 ? '+' : '') + fmtCur(v) }
}

// ── Summary banner (overview sau khi parse) ──────────────────────────────────

function SummaryBanner({ result, rec, bankName }: { result: BankParseResult; rec: any; bankName?: string }) {
  const balOk = rec.meta.closing_balance != null && rec.computed_closing != null &&
                Math.abs(rec.computed_closing - rec.meta.closing_balance) < 1
  const fmtCur = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString('vi-VN')

  return (
    <div className="space-y-4">
      {/* Stats banner — gradient blue */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-blue-900 text-white px-6 py-5">
        <div className="grid grid-cols-4 gap-4">
          <BannerStat label="File" value="1" />
          <BannerStat label="Thành công" value="1" />
          <BannerStat label="Giao dịch" value={String(result.txns.length)} />
          <BannerStat label="Đối chiếu" value={`${rec.totalRowOk}/${result.txns.length}`}
            valueClass={rec.totalRowFail === 0 ? 'text-green-300' : 'text-amber-300'} />
        </div>
      </div>

      {/* Result card per file */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
              balOk ? 'bg-green-500' : 'bg-amber-500'
            }`}>✓</div>
            <div>
              <p className="font-semibold text-gray-900">{result.raw_filename ?? 'sao kê'}</p>
              <p className="text-xs text-gray-500">
                {bankName ?? `Số TK: ${result.account_number ?? '—'}`}
                {' · '}{result.txns.length} giao dịch
                {' · '}Đối chiếu: {rec.totalRowOk}/{result.txns.length} OK
              </p>
            </div>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
            balOk ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
          }`}>
            {balOk ? 'KHỚP' : 'CHƯA KHỚP'}
          </span>
        </div>
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          <CardStat label="SỐ DƯ ĐẦU KỲ" value={fmtCur(rec.meta.opening_balance)} />
          <CardStat label="PHÁT SINH NỢ" value={fmtCur(rec.sumDebit)} color="text-red-600" />
          <CardStat label="PHÁT SINH CÓ" value={fmtCur(rec.sumCredit)} color="text-brand-800" />
          <CardStat label="SỐ DƯ CUỐI KỲ" value={fmtCur(rec.meta.closing_balance)} bold />
        </div>
      </div>
    </div>
  )
}

function BannerStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-center">
      <p className={`text-3xl font-bold ${valueClass ?? 'text-white'}`}>{value}</p>
      <p className="text-xs text-blue-100/80 mt-1">{label}</p>
    </div>
  )
}

function CardStat({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`tabular-nums ${bold ? 'text-base font-semibold' : 'text-sm font-medium'} ${color ?? 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}

function Row({ label, app, pdf, fmt, compare }: {
  label: string
  app?: number | null
  pdf?: number | null
  fmt: (v: number) => string
  compare?: boolean
}) {
  const match = app != null && pdf != null && Math.abs(app - pdf) < 1
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-gray-700">{label}:</span>
      <div className="text-right">
        {app != null && <span className="font-mono font-medium text-gray-900">{fmt(app)}</span>}
        {pdf != null && (
          <span className={`ml-2 font-mono text-[10px] ${
            compare ? (match ? 'text-green-700' : 'text-red-600') : 'text-gray-500'
          }`}>
            {app != null ? '(PDF: ' : ''}{fmt(pdf)}{app != null ? ')' : ''}
            {compare && (match ? ' ✓' : ' ❌')}
          </span>
        )}
      </div>
    </div>
  )
}
