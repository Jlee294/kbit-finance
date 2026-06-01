import { listCompanies }       from '@/features/companies/queries'
import { listCalendar }         from '@/features/tax-calendar/queries'
import { TaxCalendarTable }     from '@/features/tax-calendar/components/TaxCalendarTable'
import { upsertCalendarItem }   from '@/features/tax-calendar/actions'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { TAX_TYPES, TAX_TYPE_LABELS } from '@/features/tax-plans/schema'

interface SearchParams { company?: string }

export const dynamic = 'force-dynamic'

export default async function LichThuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp        = await searchParams
  const companyId = sp.company

  const [companies, me] = await Promise.all([listCompanies(), getCurrentUser()])
  const canEdit = !!me && canApprove(me.role)

  const items = companyId ? await listCalendar(companyId) : []

  const today = new Date().toISOString().slice(0, 10)
  const soon  = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const overdueCount  = items.filter(i => i.status === 'pending' && i.due_date < today).length
  const dueSoonCount  = items.filter(i => i.status === 'pending' && i.due_date >= today && i.due_date <= soon).length

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Lịch tuân thủ thuế</h1>
        <p className="text-sm text-gray-500 mt-0.5">Theo dõi nghĩa vụ thuế, nhắc hạn nộp</p>
      </div>

      {/* Bộ lọc công ty — form GET */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border px-4 py-3 shadow-sm">
        <form method="get" className="flex gap-3 items-end">
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Công ty</p>
            <select
              name="company"
              defaultValue={companyId ?? ''}
              className="h-8 rounded-md border text-sm px-2 bg-white min-w-[160px]"
            >
              <option value="">— Chọn công ty —</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
          >
            Xem
          </button>
        </form>

        {/* Summary badges */}
        {companyId && (
          <div className="flex gap-2 ml-auto">
            {overdueCount > 0 && (
              <span className="text-xs bg-red-100 text-red-700 font-semibold px-2.5 py-1 rounded-full">
                {overdueCount} quá hạn
              </span>
            )}
            {dueSoonCount > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">
                {dueSoonCount} đến hạn ≤7 ngày
              </span>
            )}
          </div>
        )}
      </div>

      {/* Form thêm nghĩa vụ */}
      {canEdit && companyId && (
        <form
          action={async (fd: FormData) => {
            'use server'
            await upsertCalendarItem({
              company_id: fd.get('company_id') as string,
              tax_type:   fd.get('tax_type')   as string,
              period:     fd.get('period')     as string,
              due_date:   fd.get('due_date')   as string,
              note:       (fd.get('note') as string) || undefined,
            })
          }}
          className="rounded-xl border bg-white shadow-sm p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end"
        >
          <input type="hidden" name="company_id" value={companyId} />
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Loại thuế</label>
            <select name="tax_type" className="w-full h-8 rounded-md border text-sm px-2 bg-white">
              {TAX_TYPES.map(t => (
                <option key={t} value={t}>{TAX_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Kỳ</label>
            <input
              name="period"
              className="w-full h-8 rounded-md border text-sm px-2"
              placeholder="YYYY-MM"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Hạn nộp</label>
            <input
              type="date"
              name="due_date"
              className="w-full h-8 rounded-md border text-sm px-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Ghi chú</label>
            <input
              name="note"
              className="w-full h-8 rounded-md border text-sm px-2"
              placeholder="Tùy chọn"
            />
          </div>
          <button
            type="submit"
            className="h-8 px-3 bg-brand-800 text-white rounded-md text-sm hover:bg-brand-700"
          >
            Thêm
          </button>
        </form>
      )}

      {!companyId ? (
        <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
          Chọn công ty để xem lịch thuế.
        </div>
      ) : (
        <TaxCalendarTable items={items} canEdit={canEdit} />
      )}
    </div>
  )
}
