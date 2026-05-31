interface KpiCardProps {
  label:    string
  value:    number
  currency: string
  positive?: boolean  // green when positive, red when negative
  neutral?:  boolean  // gray regardless of sign
}

function fmt(value: number, currency: string) {
  return new Intl.NumberFormat('vi-VN', {
    style:           'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function KpiCard({ label, value, currency, positive, neutral }: KpiCardProps) {
  let colorClass = 'text-gray-900'
  if (!neutral) {
    if (positive !== undefined) {
      colorClass = value >= 0 ? 'text-green-600' : 'text-red-600'
    }
  }
  return (
    <div className="rounded-xl border bg-white shadow-sm px-5 py-4 flex flex-col gap-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
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
      <KpiCard label="Tổng thu"           value={totalIncome}   currency={currency} neutral />
      <KpiCard label="Tổng chi"           value={totalExpense}  currency={currency} neutral />
      <KpiCard label="Dòng tiền thuần"    value={netCashFlow}   currency={currency} positive />
      <KpiCard label="Công nợ KH (phải thu)" value={arOutstanding} currency={currency} neutral />
      <KpiCard label="Công nợ NCC (phải trả)" value={apOutstanding} currency={currency} neutral />
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
      <KpiCard label="Tổng thu"           value={totalIncomeVnd}   currency="VND" neutral />
      <KpiCard label="Tổng chi"           value={totalExpenseVnd}  currency="VND" neutral />
      <KpiCard label="Dòng tiền thuần"    value={netCashFlowVnd}   currency="VND" positive />
      <KpiCard label="Công nợ KH (phải thu)" value={arOutstandingVnd} currency="VND" neutral />
      <KpiCard label="Công nợ NCC (phải trả)" value={apOutstandingVnd} currency="VND" neutral />
    </div>
  )
}
