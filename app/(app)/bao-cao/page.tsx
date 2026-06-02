import { Suspense }                          from 'react'
import { listCompanies }                       from '@/features/companies/queries'
import { getCompanyReport }                    from '@/features/reports/queries'
import { CompanyKpiCards }                     from '@/features/reports/components/KpiCards'
import { CashFlowTable }                       from '@/features/reports/components/CashFlowTable'
import { ArDebtTable, ApDebtTable }            from '@/features/reports/components/DebtTables'
import { ReportFilters }                       from '@/features/reports/components/ReportFilters'
import Link                                    from 'next/link'
import { createClient }                        from '@/lib/supabase/server'
import { PageHeader }                          from '@/components/shared/PageHeader'
import { EmptyState }                          from '@/components/shared/EmptyState'
import { PAGE_WRAPPER }                        from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

interface SearchParams {
  company?: string
  project?: string
  from?:    string
  to?:      string
}

// ── Component streaming nặng — render sau qua Suspense ────────────────────────
async function ReportContent({
  companyId, projectId, from, to,
}: {
  companyId: string
  projectId?: string
  from?: string
  to?: string
}) {
  const report = await getCompanyReport({ companyId, projectId, from, to })
  if (!report) return null

  const cashFlowRows = [
    { label: 'Tổng thu',        value: report.total_income  },
    { label: 'Tổng chi',        value: report.total_expense },
    { label: 'Dòng tiền thuần', value: report.net_cash_flow, bold: true, positive: true },
  ]

  return (
    <>
      <CompanyKpiCards
        totalIncome={report.total_income}
        totalExpense={report.total_expense}
        netCashFlow={report.net_cash_flow}
        arOutstanding={report.ar_outstanding}
        apOutstanding={report.ap_outstanding}
        currency={report.currency}
      />
      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-2">Tóm tắt dòng tiền</h2>
        <CashFlowTable rows={cashFlowRows} currency={report.currency} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Suspense fallback={<div className="h-32 bg-gray-50 rounded-xl animate-pulse" />}>
          <ArDebtTable companyId={companyId} projectId={projectId} to={to} currency={report.currency} />
        </Suspense>
        <Suspense fallback={<div className="h-32 bg-gray-50 rounded-xl animate-pulse" />}>
          <ApDebtTable companyId={companyId} projectId={projectId} to={to} />
        </Suspense>
      </div>
    </>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="h-32 bg-gray-100 rounded-xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function BaoCaoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp        = await searchParams
  const companyId = sp.company
  const projectId = sp.project
  const from      = sp.from
  const to        = sp.to

  // Chạy song song: listCompanies + projects (nếu có companyId)
  const supabase = await createClient()
  const [companies, projectsRes] = await Promise.all([
    listCompanies(),
    companyId
      ? supabase.from('projects').select('id, name').eq('company_id', companyId).order('name')
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ])
  const projects: Array<{ id: string; name: string }> = projectsRes.data ?? []

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Báo cáo pháp nhân"
        subtitle="Dòng tiền và công nợ theo từng công ty"
        actions={
          <Link href="/bao-cao/hop-nhat" className="text-sm text-brand-700 hover:underline font-medium">
            Xem báo cáo hợp nhất →
          </Link>
        }
      />

      {/* Filter hiện ngay — không bị block bởi report query */}
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

      {!companyId ? (
        <EmptyState
          icon="📊"
          title="Chọn một công ty để xem báo cáo"
          description="Sử dụng bộ lọc bên trên để chọn công ty + khoảng thời gian"
        />
      ) : (
        /* Stream report content — skeleton hiện trong lúc chờ */
        <Suspense fallback={<ReportSkeleton />}>
          <ReportContent
            companyId={companyId}
            projectId={projectId}
            from={from}
            to={to}
          />
        </Suspense>
      )}
    </div>
  )
}
