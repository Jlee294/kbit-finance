import { Suspense }                 from 'react'
import { getConsolidatedReport }    from '@/features/reports/queries'
import { ConsolidatedKpiCards }     from '@/features/reports/components/KpiCards'
import { CashFlowTable }            from '@/features/reports/components/CashFlowTable'
import { ReportFilters }            from '@/features/reports/components/ReportFilters'

export const dynamic = 'force-dynamic'
import Link                         from 'next/link'
import { PageHeader }               from '@/components/shared/PageHeader'
import { PAGE_WRAPPER }             from '@/lib/ui-tokens'

interface SearchParams {
  from?: string
  to?:   string
}

export default async function HopNhatPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp   = await searchParams
  const from = sp.from
  const to   = sp.to

  const report = await getConsolidatedReport({ from, to })

  const cashFlowRows = [
    { label: 'Tổng thu (toàn Group)',   value: report.total_income_vnd   },
    { label: 'Tổng chi (toàn Group)',   value: report.total_expense_vnd  },
    {
      label:    'Dòng tiền thuần (toàn Group)',
      value:    report.net_cash_flow_vnd,
      bold:     true,
      positive: true,
    },
  ]

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Báo cáo hợp nhất Group"
        subtitle="Tổng hợp toàn bộ pháp nhân, đã loại trừ giao dịch nội bộ, quy đổi về VND"
        actions={
          <Link href="/bao-cao" className="text-sm text-brand-700 hover:underline font-medium">
            ← Báo cáo từng pháp nhân
          </Link>
        }
      />

      {/* Missing rate warning */}
      {report.missing_rate && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Cảnh báo:</strong> Một số giao dịch hoặc công nợ ngoại tệ thiếu tỷ giá tại ngày
          tương ứng. Các dòng đó chưa được tính vào tổng. Vui lòng bổ sung tỷ giá tại{' '}
          <Link href="/danh-muc/ty-gia" className="underline">Danh mục / Tỷ giá</Link>.
        </div>
      )}

      {/* Filters */}
      <Suspense fallback={null}>
        <ReportFilters
          mode="consolidated"
          companies={[]}
          projects={[]}
          from={from}
          to={to}
        />
      </Suspense>

      {/* KPI Cards */}
      <ConsolidatedKpiCards
        totalIncomeVnd={report.total_income_vnd}
        totalExpenseVnd={report.total_expense_vnd}
        netCashFlowVnd={report.net_cash_flow_vnd}
        arOutstandingVnd={report.ar_outstanding_vnd}
        apOutstandingVnd={report.ap_outstanding_vnd}
      />

      {/* Cash Flow Summary */}
      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-2">Tóm tắt dòng tiền (VND)</h2>
        <CashFlowTable rows={cashFlowRows} currency="VND" />
      </div>

      {/* Debt summary note */}
      <div className="rounded-xl border bg-white shadow-sm px-5 py-4 grid md:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Công nợ KH (phải thu)</p>
          <p className="text-xl font-semibold text-gray-900">
            {new Intl.NumberFormat('vi-VN', {
              style: 'currency', currency: 'VND',
              minimumFractionDigits: 0,
            }).format(report.ar_outstanding_vnd)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Quy về VND theo tỷ giá cuối kỳ; loại giao dịch nội bộ</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Công nợ NCC (phải trả)</p>
          <p className="text-xl font-semibold text-gray-900">
            {new Intl.NumberFormat('vi-VN', {
              style: 'currency', currency: 'VND',
              minimumFractionDigits: 0,
            }).format(report.ap_outstanding_vnd)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Theo tỷ giá đóng băng lúc ghi nợ (supplier_orders.exchange_rate)
          </p>
        </div>
      </div>
    </div>
  )
}
