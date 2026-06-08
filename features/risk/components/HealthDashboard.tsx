import { GROUP_LABELS, INDICATORS, type RiskGroup } from '../indicators'
import type { AssessmentRow }                        from '../queries'
import type { Light }                                from '../lights'

const LIGHT_CLS: Record<Light, string> = {
  green:  'bg-brand-100  text-brand-800  border-brand-200',
  yellow: 'bg-amber-100  text-amber-800  border-amber-200',
  red:    'bg-red-100    text-red-800    border-red-200',
}
const LIGHT_LABEL: Record<Light, string> = {
  green:  'Bình thường',
  yellow: 'Cần theo dõi',
  red:    'Rủi ro cao',
}
const LIGHT_DOT: Record<Light, string> = {
  green:  'bg-brand-500',
  yellow: 'bg-amber-500',
  red:    'bg-red-500',
}

function fmtValue(value: number, unit: string) {
  if (unit === 'vnd') return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
  if (unit === 'days')    return `${value.toFixed(1)} ngày`
  if (unit === 'percent') return `${value.toFixed(1)}%`
  return String(value)
}

interface Props {
  assessment: AssessmentRow
}

export function HealthDashboard({ assessment }: Props) {
  const { scores, overall, assessed_at } = assessment
  const indicatorMeta = Object.fromEntries(INDICATORS.map(i => [i.code, i]))

  return (
    <div className="space-y-6">
      {/* ── Đèn tổng ── */}
      <div className={`rounded-2xl border-2 px-6 py-5 flex items-center gap-4 ${LIGHT_CLS[overall]}`}>
        <span className={`h-5 w-5 rounded-full shrink-0 ${LIGHT_DOT[overall]}`} />
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold opacity-60">Sức khỏe tổng</p>
          <p className="text-2xl font-bold">{LIGHT_LABEL[overall]}</p>
        </div>
        <div className="ml-auto text-xs opacity-50">
          Chấm lúc {new Date(assessed_at).toLocaleString('vi-VN')}
        </div>
      </div>

      {/* ── 5 nhóm ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.entries(GROUP_LABELS) as [RiskGroup, string][]).map(([g, label]) => {
          const light = scores.groups[g] ?? 'green'
          return (
            <div key={g} className={`rounded-xl border px-4 py-3 text-center ${LIGHT_CLS[light]}`}>
              <p className="text-[11px] uppercase tracking-wide font-semibold opacity-60">{label}</p>
              <div className={`mt-1.5 h-3 w-3 rounded-full mx-auto ${LIGHT_DOT[light]}`} />
            </div>
          )
        })}
      </div>

      {/* ── Bảng chi tiết chỉ tiêu ── */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Chỉ tiêu</th>
              <th className="px-4 py-3 text-left">Nhóm</th>
              <th className="px-4 py-3 text-right">Giá trị</th>
              <th className="px-4 py-3 text-right">Ngưỡng vàng</th>
              <th className="px-4 py-3 text-right">Ngưỡng đỏ</th>
              <th className="px-4 py-3 text-center">Đèn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {scores.indicators.map((ind) => {
              const meta  = indicatorMeta[ind.code]
              const light = ind.light as Light
              return (
                <tr key={ind.code} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700 font-medium text-xs">
                    {meta?.label ?? ind.code}
                    {!ind.configured && (
                      <span className="ml-1.5 text-gray-400 font-normal">(chưa đặt ngưỡng)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {GROUP_LABELS[ind.group]}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-900">
                    {fmtValue(ind.value, meta?.unit ?? 'count')}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-amber-700">
                    {ind.yellow_at != null ? fmtValue(ind.yellow_at, meta?.unit ?? 'count') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-red-700">
                    {ind.red_at != null ? fmtValue(ind.red_at, meta?.unit ?? 'count') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${LIGHT_CLS[light]}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${LIGHT_DOT[light]}`} />
                      {LIGHT_LABEL[light]}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
