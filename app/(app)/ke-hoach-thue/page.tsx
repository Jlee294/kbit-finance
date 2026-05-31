import { listCompanies }                      from '@/features/companies/queries'
import { getTaxPlan, computeActualTax }        from '@/features/tax-plans/queries'
import { TaxPlanForm }                         from '@/features/tax-plans/components/TaxPlanForm'
import { PlanVsActualTable }                   from '@/features/tax-plans/components/PlanVsActualTable'
import { getCurrentUser, canApprove }          from '@/lib/auth'

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
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Kế hoạch thuế</h1>
        <p className="text-sm text-gray-500 mt-0.5">So sánh kế hoạch thuế vs thực tế</p>
      </div>

      {/* Bộ lọc — form GET, submit bằng nút */}
      <form method="get" className="flex flex-wrap gap-3 items-end bg-white rounded-xl border px-4 py-3 shadow-sm">
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
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Năm</p>
          <input
            type="number"
            name="year"
            className="h-8 w-24 rounded-md border text-sm px-2"
            defaultValue={year}
            min={2020}
            max={2100}
          />
        </div>
        <button
          type="submit"
          className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 self-end"
        >
          Xem
        </button>
      </form>

      {!companyId && (
        <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
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
