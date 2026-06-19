import { Suspense }                          from 'react'
import { getGlobalFilter }                     from '@/lib/global-filter'
import { getCompanyReport, getSalesPurchaseSummary } from '@/features/reports/queries'
import { CompanyKpiCards }                     from '@/features/reports/components/KpiCards'
import { CashFlowTable }                       from '@/features/reports/components/CashFlowTable'
import { ReportFilters }                       from '@/features/reports/components/ReportFilters'
import Link                                    from 'next/link'
import { createClient }                        from '@/lib/supabase/server'
import { PageHeader }                          from '@/components/shared/PageHeader'
import { EmptyState }                          from '@/components/shared/EmptyState'
import { PAGE_WRAPPER }                        from '@/lib/ui-tokens'
import { getT } from '@/lib/i18n/server'

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
  const t = await getT()
  const [report, sp] = await Promise.all([
    getCompanyReport({ companyId, projectId, from, to }),
    getSalesPurchaseSummary({ companyId, from, to }),
  ])
  if (!report) return null
  const cur = report.currency

  const cashFlowRows = [
    { label: 'Tiền đã thu',     value: report.total_income  },
    { label: 'Tiền đã chi',     value: report.total_expense },
    { label: 'Dòng tiền thuần', value: report.net_cash_flow, bold: true, positive: true },
  ]

  // Bán ra / mua vào theo hóa đơn — tách tiền hàng & VAT
  const vatPayable = sp.revenueVat - sp.purchaseVat   // VAT phải nộp (đầu ra − đầu vào)
  const salesPurchaseRows = [
    { label: `Doanh thu bán ra (${sp.salesCount} đơn)`,    value: sp.revenue,   bold: true },
    { label: '— trong đó tiền hàng (chưa VAT)',            value: sp.revenueNet },
    { label: '— VAT đầu ra',                               value: sp.revenueVat },
    { label: `Chi phí mua vào (${sp.purchaseCount} đơn)`,  value: sp.purchase,  bold: true },
    { label: '— trong đó tiền hàng (chưa VAT)',            value: sp.purchaseNet },
    { label: '— VAT đầu vào',                              value: sp.purchaseVat },
    { label: 'Chênh lệch tiền hàng (bán − mua)',           value: sp.revenueNet - sp.purchaseNet, bold: true, positive: true },
    { label: 'VAT phải nộp (đầu ra − đầu vào)',            value: vatPayable, positive: true },
  ]

  return (
    <>
      <CompanyKpiCards
        revenue={sp.revenue}
        purchase={sp.purchase}
        totalIncome={report.total_income}
        totalExpense={report.total_expense}
        netCashFlow={report.net_cash_flow}
        currency={cur}
      />
      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-medium text-gray-600 mb-2">{t('Bán ra & mua vào (theo hóa đơn)')}</h2>
          <CashFlowTable rows={salesPurchaseRows} currency={cur} />
        </div>
        <div>
          <h2 className="text-sm font-medium text-gray-600 mb-2">{t('Tóm tắt dòng tiền (thực thu/chi)')}</h2>
          <CashFlowTable rows={cashFlowRows} currency={cur} />
        </div>
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
  const t = await getT()
  const sp        = await searchParams
  const { companyId } = await getGlobalFilter()
  const projectId = sp.project
  const from      = sp.from
  const to        = sp.to

  const supabase = await createClient()
  const projectsRes = companyId
    ? await supabase.from('projects').select('id, name').eq('company_id', companyId).order('name')
    : { data: [] as Array<{ id: string; name: string }> }
  const projects: Array<{ id: string; name: string }> = projectsRes.data ?? []

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Báo cáo pháp nhân')}
        subtitle={t('Doanh thu, chi phí và dòng tiền theo từng công ty (công nợ xem ở menu Công nợ)')}
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
          projects={projects}
          companyId={companyId ?? undefined}
          projectId={projectId}
          from={from}
          to={to}
        />
      </Suspense>

      {!companyId ? (
        <EmptyState
          icon="📊"
          title={t('Chọn một công ty để xem báo cáo')}
          description={t('Sử dụng bộ lọc bên trên để chọn công ty + khoảng thời gian')}
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
