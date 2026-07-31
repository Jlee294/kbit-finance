import { Suspense }                          from 'react'
import { getGlobalFilter }                     from '@/lib/global-filter'
import { getCompanyReport, getProfitAndLossSummary, getSalesPurchaseSummary } from '@/features/reports/queries'
import { CompanyKpiCards }                     from '@/features/reports/components/KpiCards'
import { CashFlowTable }                       from '@/features/reports/components/CashFlowTable'
import { ReportFilters }                       from '@/features/reports/components/ReportFilters'
import Link                                    from 'next/link'
import { createClient }                        from '@/lib/supabase/server'
import { PageHeader }                          from '@/components/shared/PageHeader'
import { EmptyState }                          from '@/components/shared/EmptyState'
import { PAGE_WRAPPER }                        from '@/lib/ui-tokens'
import { getT } from '@/lib/i18n/server'
import { isDemoMode } from '@/lib/demo'

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
  const [report, sp, profitLoss] = await Promise.all([
    getCompanyReport({ companyId, projectId, from, to }),
    getSalesPurchaseSummary({ companyId, from, to }),
    getProfitAndLossSummary({ companyId, from, to }),
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
  const salesDeclaredNet = sp.revenueNet + profitLoss.giftDeclaredValue
  const salesPurchaseRows = [
    { label: `Bảng kê bán ra (${sp.salesCount} hóa đơn, gồm quà tặng)`, value: salesDeclaredNet + sp.revenueVat, bold: true },
    { label: '— doanh thu được ghi nhận (chưa VAT)',       value: sp.revenueNet },
    { label: '— giá trị quà tặng kê thuế, không ghi doanh thu', value: profitLoss.giftDeclaredValue },
    { label: '— VAT đầu ra',                               value: sp.revenueVat },
    { label: `Bảng kê mua vào (${sp.purchaseCount} hóa đơn)`, value: sp.purchase, bold: true },
    { label: '— trong đó tiền hàng (chưa VAT)',            value: sp.purchaseNet },
    { label: '— VAT đầu vào',                              value: sp.purchaseVat },
    { label: 'VAT phải nộp (đầu ra − đầu vào)',            value: vatPayable, positive: true },
  ]
  const profitLossRows = [
    { label: 'Doanh thu được ghi nhận (chưa VAT)', value: profitLoss.revenue, bold: true },
    { label: 'Giá vốn hàng đã xuất (gồm cả hàng quà tặng)', value: profitLoss.cogs },
    { label: 'Chi phí trong kỳ không qua kho', value: profitLoss.operatingExpenses },
    { label: 'Lợi nhuận = Doanh thu − Giá vốn − Chi phí', value: profitLoss.profit, bold: true, positive: true },
  ]
  const deferredRows = [
    { label: 'Giá trị kê thuế của hóa đơn quà tặng — không phải doanh thu', value: profitLoss.giftDeclaredValue },
    { label: 'Mua hàng tồn kho — chưa vào chi phí kỳ này', value: profitLoss.inventoryPurchases },
    { label: 'Chi phí trả trước — chờ phân bổ', value: profitLoss.prepaid },
    { label: 'Công cụ dụng cụ — chờ phân bổ', value: profitLoss.tools },
    { label: 'Tài sản cố định — chờ khấu hao', value: profitLoss.fixedAssets },
    { label: 'Thu hộ/chi hộ — không tính lãi lỗ', value: profitLoss.passThrough },
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
      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-medium text-gray-600 mb-2">{t('Kết quả kinh doanh đúng bản chất')}</h2>
          <CashFlowTable rows={profitLossRows} currency={cur} />
        </div>
        <div>
          <h2 className="text-sm font-medium text-gray-600 mb-2">{t('Khoản loại khỏi lãi lỗ và chênh lệch cần biết')}</h2>
          <CashFlowTable rows={deferredRows} currency={cur} />
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

  let projects: Array<{ id: string; name: string }> = []
  if (!isDemoMode()) {
    const supabase = await createClient()
    const projectsRes = companyId
      ? await supabase.from('projects').select('id, name').eq('company_id', companyId).order('name')
      : { data: [] as Array<{ id: string; name: string }> }
    projects = projectsRes.data ?? []
  }

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

      {isDemoMode() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Đã nhập đủ SPNH Techcombank của GLA; tiền thu, tiền chi và dòng tiền bên dưới lấy trực tiếp
          từ 48 giao dịch ngân hàng. Chưa có file sổ quỹ nên chưa bao gồm phát sinh tiền mặt.
        </div>
      )}

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
