import { listCompanies }                      from '@/features/companies/queries'
import { getTaxPlan, computeActualTax }        from '@/features/tax-plans/queries'
import { TaxPlanForm }                         from '@/features/tax-plans/components/TaxPlanForm'
import { PlanVsActualTable }                   from '@/features/tax-plans/components/PlanVsActualTable'
import { getCurrentUser, canApprove }          from '@/lib/auth'
import { PageHeader }                          from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FilterSubmit, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { PAGE_WRAPPER }                        from '@/lib/ui-tokens'

interface SearchParams { company?: string; year?: string }

export const dynamic = 'force-dynamic'

export default async function KeHoachThuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp        = await searchParams
  const companyId = sp.company
  const year      = Number(sp.year) || new Date().getFullYear()

  const [companies, me] = await Promise.all([listCompanies(), getCurrentUser()])
  const canEdit = !!me && canApprove(me.role)

  const plan    = companyId ? await getTaxPlan(companyId, year) : null
  const actuals = companyId ? await computeActualTax(companyId, year) : {}
  const lines   = plan?.plan_data?.lines ?? []

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Kế hoạch thuế"
        subtitle="So sánh kế hoạch thuế vs thực tế"
      />

      <FilterBar>
        <FilterField label="Công ty">
          <select name="company" defaultValue={companyId ?? ''} className={`${FILTER_CONTROL} min-w-[180px]`}>
            <option value="">— Chọn công ty —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Năm">
          <input type="number" name="year" defaultValue={year} min={2020} max={2100}
            className={`${FILTER_CONTROL} w-24`} />
        </FilterField>
        <FilterSubmit>Xem</FilterSubmit>
      </FilterBar>

      {!companyId && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-400">
          Chọn công ty để xem kế hoạch thuế.
        </div>
      )}

      {companyId && (
        <>
          {canEdit && (
            <TaxPlanForm
              companyId={companyId}
              year={year}
              lines={lines}
            />
          )}
          <div>
            <h2 className="text-sm font-medium text-gray-600 mb-2">
              Kế hoạch vs Thực tế — {year}
            </h2>
            <PlanVsActualTable lines={lines} actuals={actuals} />
          </div>
        </>
      )}
    </div>
  )
}
