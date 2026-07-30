'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setDebtOpening, deleteDebtOpening } from '@/features/debts/actions'
import type { DebtOpeningRow } from '@/features/debts/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { formatVND } from '@/lib/format'
import { useT } from '@/lib/i18n/client'

interface Partner { id: string; code: string; name: string }

export function DebtOpeningClient({ year, canWrite, customers, suppliers, arOpenings, apOpenings }: {
  year: number
  canWrite: boolean
  customers: Partner[]
  suppliers: Partner[]
  arOpenings: DebtOpeningRow[]
  apOpenings: DebtOpeningRow[]
}) {
  const router = useRouter()
  const t = useT()
  const [tab, setTab] = useState<'customer' | 'supplier'>('customer')
  const [partnerId, setPartnerId] = useState('')
  const [debit, setDebit] = useState('')
  const [credit, setCredit] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const partners = tab === 'customer' ? customers : suppliers
  const openings = tab === 'customer' ? arOpenings : apOpenings

  function prefill(row: DebtOpeningRow) {
    setPartnerId(row.partner_id)
    setDebit(String(row.debit_amount))
    setCredit(String(row.credit_amount))
    setNote(row.note ?? '')
  }

  async function save() {
    setSaving(true); setError('')
    const r = await setDebtOpening({
      partner_type: tab,
      partner_id: partnerId,
      year,
      debit_amount: debit,
      credit_amount: credit,
      note,
    })
    setSaving(false)
    if (r.error) { setError(r.error); return }
    setPartnerId(''); setDebit(''); setCredit(''); setNote(''); router.refresh()
  }

  async function remove(id: string) {
    const r = await deleteDebtOpening(id)
    if (r.error) { setError(r.error); return }
    router.refresh()
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Số dư đầu kỳ công nợ')}
        subtitle={t(`Khai số dư Nợ / Có đầu kỳ năm ${year} cho từng đối tượng (KH hoặc NCC)`)}
      />

      <div className="flex items-center gap-2">
        <button onClick={() => { setTab('customer'); setPartnerId('') }}
          className={`px-4 py-2 text-sm rounded-md border ${tab === 'customer' ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {t('Phải thu (KH)')}
        </button>
        <button onClick={() => { setTab('supplier'); setPartnerId('') }}
          className={`px-4 py-2 text-sm rounded-md border ${tab === 'supplier' ? 'bg-primary text-white border-primary' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          {t('Phải trả (NCC)')}
        </button>
      </div>

      {canWrite && (
        <div className="rounded-xl border bg-white p-4 grid grid-cols-5 gap-3 items-end">
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-gray-500">{tab === 'customer' ? t('Khách hàng') : t('Nhà cung cấp')}</label>
            <select value={partnerId} onChange={e => setPartnerId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
              <option value="">{t('— Chọn đối tượng —')}</option>
              {partners.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Dư Nợ đầu kỳ')}</label>
            <input type="number" min="0" step="any" value={debit} onChange={e => setDebit(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" placeholder="0" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Dư Có đầu kỳ')}</label>
            <input type="number" min="0" step="any" value={credit} onChange={e => setCredit(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" placeholder="0" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Ghi chú')}</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" />
          </div>
          <div className="col-span-5 flex items-center gap-3">
            <button onClick={save} disabled={saving || !partnerId}
              className="h-9 px-4 bg-primary text-white text-sm rounded-md hover:bg-primary-700 disabled:opacity-50">
              {saving ? t('Đang lưu...') : t('Lưu số dư đầu kỳ')}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        {t('Số dư đầu kỳ đã khai')} — {tab === 'customer' ? t('Phải thu') : t('Phải trả')} — {t(`Năm ${year}`)}
      </h3>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-montserrat text-xs font-semibold tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">{t('Mã')}</th>
              <th className="px-4 py-3 text-left">{t('Tên đối tượng')}</th>
              <th className="px-4 py-3 text-right">{t('Dư Nợ')}</th>
              <th className="px-4 py-3 text-right">{t('Dư Có')}</th>
              <th className="px-4 py-3 text-left">{t('Ghi chú')}</th>
              {canWrite && <th className="px-4 py-3 w-20" />}
            </tr>
          </thead>
          <tbody>
            {openings.length === 0 ? (
              <tr><td colSpan={canWrite ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                {t('Chưa khai số dư đầu kỳ công nợ nào')}
              </td></tr>
            ) : openings.map(o => (
              <tr key={o.id} className={`border-t ${canWrite ? 'cursor-pointer hover:bg-brand-50/40' : ''}`}
                onClick={canWrite ? () => prefill(o) : undefined}>
                <td className="px-4 py-3 font-mono text-gray-800">{o.partner_code}</td>
                <td className="px-4 py-3 text-gray-700">{o.partner_name}</td>
                <td className="px-4 py-3 text-right font-medium">{o.debit_amount ? formatVND(o.debit_amount) : '-'}</td>
                <td className="px-4 py-3 text-right font-medium">{o.credit_amount ? formatVND(o.credit_amount) : '-'}</td>
                <td className="px-4 py-3 text-gray-500">{o.note ?? ''}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-center">
                    <button onClick={e => { e.stopPropagation(); remove(o.id) }}
                      className="text-xs text-red-500 hover:text-red-700">{t('Xóa')}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {openings.length > 0 && (
            <tfoot className="bg-slate-50 border-t border-slate-300 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={2}>{t('Tổng')}</td>
                <td className="px-4 py-3 text-right">{formatVND(openings.reduce((s, o) => s + o.debit_amount, 0))}</td>
                <td className="px-4 py-3 text-right">{formatVND(openings.reduce((s, o) => s + o.credit_amount, 0))}</td>
                <td colSpan={canWrite ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
