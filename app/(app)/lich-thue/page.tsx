import { listCompanies }       from '@/features/companies/queries'
import { listCalendar }         from '@/features/tax-calendar/queries'
import { TaxCalendarTable }     from '@/features/tax-calendar/components/TaxCalendarTable'
import { GenerateYearlyButton } from '@/features/tax-calendar/components/GenerateYearlyButton'
import { upsertCalendarItem }   from '@/features/tax-calendar/actions'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { listTaxTypes, taxTypeLabelMap } from '@/features/tax-types/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { AutoSubmit } from '@/components/shared/AutoSubmit'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { todayLocal, formatLocalDate } from '@/lib/format'
import { getT }                from '@/lib/i18n/server'

interface SearchParams { company?: string }

export const dynamic = 'force-dynamic'

export default async function LichThuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp        = await searchParams
  const companyId = sp.company
  const t = await getT()

  const [companies, me, taxTypes] = await Promise.all([listCompanies(), getCurrentUser(), listTaxTypes(false)])
  const canEdit = !!me && canApprove(me.role)
  const activeTaxTypes = taxTypes.filter(t => t.is_active)
  const taxLabels = taxTypeLabelMap(taxTypes)

  const items = companyId ? await listCalendar(companyId) : []

  const today = todayLocal()
  const soon  = formatLocalDate(new Date(Date.now() + 7 * 86_400_000))
  const overdueCount  = items.filter(i => i.status === 'pending' && i.due_date < today).length
  const dueSoonCount  = items.filter(i => i.status === 'pending' && i.due_date >= today && i.due_date <= soon).length

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Lịch tuân thủ thuế')}
        subtitle={t('Theo dõi nghĩa vụ thuế, nhắc hạn nộp')}
        actions={companyId ? (
          <div className="flex flex-wrap gap-2 items-center">
            {overdueCount > 0 && (
              <span className="text-xs bg-danger-50 text-danger-700 ring-1 ring-danger-500/30 font-semibold px-2.5 py-1 rounded-full">
                🔴 {overdueCount} {t('quá hạn')}
              </span>
            )}
            {dueSoonCount > 0 && (
              <span className="text-xs bg-warning-50 text-warning-700 ring-1 ring-warning-500/30 font-semibold px-2.5 py-1 rounded-full">
                ⚠ {dueSoonCount} {t('đến hạn ≤7 ngày')}
              </span>
            )}
            {canEdit && <GenerateYearlyButton companyId={companyId} />}
          </div>
        ) : undefined}
      />

      <FilterBar>
        <AutoSubmit />
        <FilterField label={t('Công ty')}>
          <select name="company" defaultValue={companyId ?? ''} className={`${FILTER_CONTROL} min-w-[180px]`}>
            <option value="">{t('— Chọn công ty —')}</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
      </FilterBar>

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
            <label className="text-xs text-gray-500">{t('Loại thuế')}</label>
            <select name="tax_type" className="w-full h-8 rounded-md border text-sm px-2 bg-white">
              {activeTaxTypes.map(t => (
                <option key={t.id} value={t.code}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Kỳ')}</label>
            <input
              name="period"
              className="w-full h-8 rounded-md border text-sm px-2"
              placeholder="YYYY-MM"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Hạn nộp')}</label>
            <input
              type="date"
              name="due_date"
              className="w-full h-8 rounded-md border text-sm px-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Ghi chú')}</label>
            <input
              name="note"
              className="w-full h-8 rounded-md border text-sm px-2"
              
            />
          </div>
          <button
            type="submit"
            className="h-8 px-3 bg-brand-800 text-white rounded-md text-sm hover:bg-brand-700"
          >
            {t('Thêm')}
          </button>
        </form>
      )}

      {!companyId ? (
        <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
          {t('Chọn công ty để xem lịch thuế.')}
        </div>
      ) : (
        <TaxCalendarTable items={items} canEdit={canEdit} taxTypeLabels={taxLabels} />
      )}
    </div>
  )
}
