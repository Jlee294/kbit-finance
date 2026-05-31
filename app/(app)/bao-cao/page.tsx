import { Suspense }                          from 'react'
import { listCompanies }                       from '@/features/companies/queries'
import { getCompanyReport }                    from '@/features/reports/queries'
import { CompanyKpiCards }                     from '@/features/reports/components/KpiCards'
import { CashFlowTable }                       from '@/features/reports/components/CashFlowTable'
import { ArDebtTable, ApDebtTable }            from '@/features/reports/components/DebtTables'
import { ReportFilters }                       from '@/features/reports/components/ReportFilters'
import Link                                    from 'next/link'

interface SearchParams {
  company?: string
  project?: string
  from?:    string
  to?:      string
}

// Next.js 15: searchParams is a Promise
export default async function BaoCaoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp         = await searchParams
  const companyId  = sp.company
  const projectId  = sp.project
  const from       = sp.from
  const to         = sp.to

  const companies = await listCompanies()

  // Projects list — loaded per company
  let projects: Array<{ id: string; name: string }> = []
  if (companyId) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name')
    projects = data ?? []
  }

  const report = companyId
    ? await getCompanyReport({ companyId, projectId, from, to })
    : null

  const cashFlowRows = report
    ? [
        { label: 'Tổng thu',        value: report.total_income  },
        { label: 'Tổng chi',        value: report.total_expense },
        { label: 'Dòng tiền thuần', value: report.net_cash_flow, bold: true, positive: true },
      ]
    : []

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Báo cáo pháp nhân</h1>
          <p className="text-sm text-gray-500 mt-0.5">Dòng tiền và công nợ theo từng công ty</p>
        </div>
        <Link
          href="/bao-cao/hop-nhat"
          className="text-sm text-blue-600 hover:underline"
        >
          Xem báo cáo hợp nhất
        </Link>
      </div>

      {/* Filters */}
      <Suspense fallback={null}>
        <ReportFilters
          mode="company"
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          projects={projects}
          companyId={companyId}
          projectId={projectId}
          from={from}
          to={to}
        />
      </Suspense>

      {!companyId && (
        <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
          Chọn một công ty để xem báo cáo.
        </div>
      )}

      {report && (
        <>
          {/* KPI Cards */}
          <CompanyKpiCards
            totalIncome={report.total_income}
            totalExpense={report.total_expense}
            netCashFlow={report.net_cash_flow}
            arOutstanding={report.ar_outstanding}
            apOutstanding={report.ap_outstanding}
            currency={report.currency}
          />

          {/* Cash Flow Summary */}
          <div>
            <h2 className="text-sm font-medium text-gray-600 mb-2">Tóm tắt dòng tiền</h2>
            <CashFlowTable rows={cashFlowRows} currency={report.currency} />
          </div>

          {/* Debt Tables */}
          <div className="grid md:grid-cols-2 gap-4">
            <Suspense fallback={<div className="h-32 bg-gray-50 rounded-xl animate-pulse" />}>
              <ArDebtTable
                companyId={companyId!}
                projectId={projectId}
                to={to}
                currency={report.currency}
              />
            </Suspense>
            <Suspense fallback={<div className="h-32 bg-gray-50 rounded-xl animate-pulse" />}>
              <ApDebtTable
                companyId={companyId!}
                projectId={projectId}
                to={to}
              />
            </Suspense>
          </div>
        </>
      )}
    </div>
  )
}
