import { getTaxPlan, computeActualTax }        from '@/features/tax-plans/queries'
import { TaxPlanForm }                         from '@/features/tax-plans/components/TaxPlanForm'
import { PlanVsActualTable }                   from '@/features/tax-plans/components/PlanVsActualTable'
import { getCurrentUser, canApprove }          from '@/lib/auth'
import { getGlobalFilter }                     from '@/lib/global-filter'
import { PageHeader }                          from '@/components/shared/PageHeader'
import { PAGE_WRAPPER }                        from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function KeHoachThuePage() {
  const { companyId, year: yearStr } = await getGlobalFilter()
  const year = Number(yearStr)
  const me = await getCurrentUser()
  const canEdit = !!me && canApprove(me.role)

  const plan    = companyId ? await getTaxPlan(companyId, year) : null
  const actuals = companyId ? await computeActualTax(companyId, year) : {}
  const lines   = plan?.plan_data?.lines ?? []

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Kế hoạch thuế"
        subtitle={`So sánh kế hoạch thuế vs thực tế — năm ${year} (theo công ty đang chọn ở thanh trên)`}
      />

      {!companyId && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-400">
          Chọn công ty ở thanh trên cùng để xem kế hoạch thuế.
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
