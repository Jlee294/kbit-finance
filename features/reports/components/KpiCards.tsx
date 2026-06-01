interface KpiCardProps {
  label:    string
  value:    number
  currency: string
  positive?: boolean      // success/danger theo dấu
  neutral?:  boolean      // gray regardless of sign
  accent?:   'brand' | 'success' | 'danger' | 'warning' | 'info'  // màu border-top
}

function fmt(value: number, currency: string) {
  return new Intl.NumberFormat('vi-VN', {
    style:           'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const ACCENT_BORDER: Record<string, string> = {
  brand:   'border-t-brand-500',
  success: 'border-t-success-500',
  danger:  'border-t-danger-500',
  warning: 'border-t-warning-500',
  info:    'border-t-info-500',
}

function KpiCard({ label, value, currency, positive, neutral, accent }: KpiCardProps) {
  let colorClass = 'text-gray-900'
  if (!neutral) {
    if (positive !== undefined) {
      colorClass = value >= 0 ? 'text-success-700' : 'text-danger-700'
    }
  }
  const accentClass = accent ? `border-t-4 ${ACCENT_BORDER[accent]}` : ''
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4 flex flex-col gap-1 ${accentClass}`}>
      <p className="text-xs text-gray-500 font-medium tracking-wide">{label}</p>
      <p className={`text-xl font-semibold ${colorClass}`}>
        {fmt(value, currency)}
      </p>
    </div>
  )
}

/* ── Company KPIs ── */
interface CompanyKpiProps {
  totalIncome:   number
  totalExpense:  number
  netCashFlow:   number
  arOutstanding: number
  apOutstanding: number
  currency:      string
}

export function CompanyKpiCards({
  totalIncome, totalExpense, netCashFlow, arOutstanding, apOutstanding, currency,
}: CompanyKpiProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <KpiCard label="Tổng thu"               value={totalIncome}   currency={currency} accent="success" neutral />
      <KpiCard label="Tổng chi"               value={totalExpense}  currency={currency} accent="danger"  neutral />
      <KpiCard label="Dòng tiền thuần"        value={netCashFlow}   currency={currency} accent="brand"   positive />
      <KpiCard label="Công nợ KH (phải thu)"  value={arOutstanding} currency={currency} accent="warning" neutral />
      <KpiCard label="Công nợ NCC (phải trả)" value={apOutstanding} currency={currency} accent="info"    neutral />
    </div>
  )
}

/* ── Consolidated KPIs ── */
interface ConsolidatedKpiProps {
  totalIncomeVnd:   number
  totalExpenseVnd:  number
  netCashFlowVnd:   number
  arOutstandingVnd: number
  apOutstandingVnd: number
}

export function ConsolidatedKpiCards({
  totalIncomeVnd, totalExpenseVnd, netCashFlowVnd, arOutstandingVnd, apOutstandingVnd,
}: ConsolidatedKpiProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <KpiCard label="Tổng thu"               value={totalIncomeVnd}   currency="VND" accent="success" neutral />
      <KpiCard label="Tổng chi"               value={totalExpenseVnd}  currency="VND" accent="danger"  neutral />
      <KpiCard label="Dòng tiền thuần"        value={netCashFlowVnd}   currency="VND" accent="brand"   positive />
      <KpiCard label="Công nợ KH (phải thu)"  value={arOutstandingVnd} currency="VND" accent="warning" neutral />
      <KpiCard label="Công nợ NCC (phải trả)" value={apOutstandingVnd} currency="VND" accent="info"    neutral />
    </div>
  )
}
