'use client'

import { useState, Fragment } from 'react'
import Link from 'next/link'
import type { LedgerRow } from '../queries'
import { isOverSettled } from '../warnings'

function n(v: number) {
  const r = Math.round(v)
  return r === 0 ? '—' : r.toLocaleString('vi-VN')
}
function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString('vi-VN') : '—'
}

/**
 * Bảng tổng hợp công nợ (theo mẫu Excel) — Đầu kỳ / Phát sinh / Cuối kỳ, tách
 * Nợ/Có. Click 1 dòng để xổ chi tiết các đơn của đối tượng đó.
 *
 * kind='AR' (phải thu/131): số dương ở bên NỢ.
 * kind='AP' (phải trả/331): số dương ở bên CÓ.
 */
export function CongNoLedger({
  title, rows, kind, hrefBase,
}: {
  title: string
  rows: LedgerRow[]
  kind: 'AR' | 'AP'
  hrefBase: string   // '/don-hang' | '/nhap-khau'
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setOpen((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  // Số dương theo chiều "Nợ" / "Có" tuỳ loại công nợ
  const sideNo = (v: number) => kind === 'AR' ? (v > 0 ? v : 0) : (v < 0 ? -v : 0)
  const sideCo = (v: number) => kind === 'AR' ? (v < 0 ? -v : 0) : (v > 0 ? v : 0)
  const psNo = (r: LedgerRow) => kind === 'AR' ? r.incurred : r.settled
  const psCo = (r: LedgerRow) => kind === 'AR' ? r.settled  : r.incurred

  const tot = rows.reduce((a, r) => ({
    openNo:  a.openNo  + sideNo(r.opening),
    openCo:  a.openCo  + sideCo(r.opening),
    psNo:    a.psNo    + psNo(r),
    psCo:    a.psCo    + psCo(r),
    closeNo: a.closeNo + sideNo(r.closing),
    closeCo: a.closeCo + sideCo(r.closing),
  }), { openNo: 0, openCo: 0, psNo: 0, psCo: 0, closeNo: 0, closeCo: 0 })

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-baseline gap-2">
        {title}
        <span className="text-xs text-gray-400 font-normal">({rows.length} đối tượng)</span>
      </h2>
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Không có công nợ trong kỳ</div>
        ) : (
          <table className="w-full text-xs min-w-[1000px] table-fixed">
            <colgroup>
              <col className="w-10" />
              <col className="w-48" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-28" /><col className="w-28" />
              <col className="w-28" /><col className="w-28" />
              <col className="w-28" /><col className="w-28" />
            </colgroup>
            <thead>
              <tr className="bg-brand-50/60 text-brand-800 text-[10px] uppercase">
                <th rowSpan={2} className="px-2 py-2 text-left border-r">STT</th>
                <th rowSpan={2} className="px-2 py-2 text-left border-r">Tên đối tượng</th>
                <th rowSpan={2} className="px-2 py-2 text-left border-r">MST</th>
                <th rowSpan={2} className="px-2 py-2 text-left border-r">Ký hiệu</th>
                <th colSpan={2} className="px-2 py-1 text-center border-r">Số dư đầu kỳ</th>
                <th colSpan={2} className="px-2 py-1 text-center border-r">Số phát sinh</th>
                <th colSpan={2} className="px-2 py-1 text-center">Số dư cuối kỳ</th>
              </tr>
              <tr className="bg-brand-50/40 text-brand-800 text-[10px]">
                <th className="px-2 py-1 text-right">Nợ</th>
                <th className="px-2 py-1 text-right border-r">Có</th>
                <th className="px-2 py-1 text-right">Nợ</th>
                <th className="px-2 py-1 text-right border-r">Có</th>
                <th className="px-2 py-1 text-right">Nợ</th>
                <th className="px-2 py-1 text-right">Có</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => {
                const expanded = open.has(r.party_id)
                return (
                  <Fragment key={r.party_id}>
                    <tr
                      className="hover:bg-brand-50/40 cursor-pointer"
                      onClick={() => toggle(r.party_id)}
                    >
                      <td className="px-2 py-1.5 border-r text-gray-500">
                        <span className="inline-block w-3 text-brand-700">{expanded ? '▾' : '▸'}</span>{i + 1}
                      </td>
                      <td className="px-2 py-1.5 border-r text-gray-800 break-words align-top">
                        {r.party_name}
                        <span className="text-[10px] text-gray-400 ml-1">[{r.party_code}]</span>
                        {/* KTT E1: phiếu thu chưa gắn đơn đã được tính vào settled — không show banner deposit nữa */}
                        {isOverSettled(r) ? <span className="block text-[10px] text-red-600 font-medium">⚠ Đã {kind === 'AR' ? 'thu' : 'trả'} vượt số nợ — kiểm tra ghi trùng</span> : null}
                      </td>
                      <td className="px-2 py-1.5 border-r font-mono text-gray-500 break-all align-top">{r.tax_code ?? '—'}</td>
                      <td className="px-2 py-1.5 border-r font-mono text-gray-600 break-all align-top">{r.symbol}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">{n(sideNo(r.opening))}</td>
                      <td className="px-2 py-1.5 text-right border-r text-gray-700">{n(sideCo(r.opening))}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">{n(psNo(r))}</td>
                      <td className="px-2 py-1.5 text-right border-r text-gray-700">{n(psCo(r))}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-amber-700">{n(sideNo(r.closing))}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-brand-800">{n(sideCo(r.closing))}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-gray-50/70">
                        <td colSpan={10} className="px-4 py-2">
                          <div className="text-[11px] text-gray-500 mb-1">Chi tiết chứng từ trong kỳ:</div>
                          {r.orders.length === 0 ? (
                            <div className="text-[11px] text-gray-400">Không có chứng từ trong kỳ (chỉ có số dư mang sang).</div>
                          ) : (
                            <table className="w-full text-[11px]">
                              <thead className="text-gray-400">
                                <tr>
                                  <th className="px-2 py-1 text-left">Mã chứng từ</th>
                                  <th className="px-2 py-1 text-left">Ngày</th>
                                  <th className="px-2 py-1 text-right">{kind === 'AR' ? 'Phát sinh (Nợ)' : 'Đã trả (Nợ)'}</th>
                                  <th className="px-2 py-1 text-right">{kind === 'AR' ? 'Đã thu (Có)' : 'Phát sinh (Có)'}</th>
                                  <th className="px-2 py-1 text-right">Còn lại</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.orders.map((o) => (
                                  <tr key={o.id} className="border-t border-gray-100">
                                    <td className="px-2 py-1">
                                      {o.is_cash ? (
                                        <span className="font-mono text-gray-500">{o.order_code}</span>
                                      ) : (
                                        <Link href={`${hrefBase}/${o.id}`} className="font-mono text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                                          {o.order_code}
                                        </Link>
                                      )}
                                    </td>
                                    <td className="px-2 py-1 text-gray-500">{fmtDate(o.order_date)}</td>
                                    <td className="px-2 py-1 text-right text-gray-700">{n(kind === 'AR' ? o.total : o.paid)}</td>
                                    <td className="px-2 py-1 text-right text-gray-700">{n(kind === 'AR' ? o.paid : o.total)}</td>
                                    <td className="px-2 py-1 text-right font-medium text-amber-700">{n(o.outstanding)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <p className="mt-1 text-[10px] text-gray-400 italic">
                            Đầu kỳ + phát sinh − đã {kind === 'AR' ? 'thu' : 'trả'} = cuối kỳ. Chứng từ kỳ trước chỉ hiện phần còn nợ.
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-brand-50/60 font-semibold text-gray-900 border-t border-brand-100">
                <td colSpan={4} className="px-2 py-2 text-right border-r">Tổng cộng</td>
                <td className="px-2 py-2 text-right">{n(tot.openNo)}</td>
                <td className="px-2 py-2 text-right border-r">{n(tot.openCo)}</td>
                <td className="px-2 py-2 text-right">{n(tot.psNo)}</td>
                <td className="px-2 py-2 text-right border-r">{n(tot.psCo)}</td>
                <td className="px-2 py-2 text-right text-amber-700">{n(tot.closeNo)}</td>
                <td className="px-2 py-2 text-right text-brand-800">{n(tot.closeCo)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
