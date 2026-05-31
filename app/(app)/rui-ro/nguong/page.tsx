import Link                    from 'next/link'
import { listCompanies }       from '@/features/companies/queries'
import { listThresholds }      from '@/features/risk/queries'
import { ThresholdForm }       from '@/features/risk/components/ThresholdForm'
import { INDICATORS, GROUP_LABELS, type RiskGroup } from '@/features/risk/indicators'
import { deleteThreshold }     from '@/features/risk/actions'
import { getCurrentUser, canApprove } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function NguongPage() {
  const [companies, thresholds, me] = await Promise.all([
    listCompanies(),
    listThresholds(),
    getCurrentUser(),
  ])
  const canEdit = !!me && canApprove(me.role)

  const companyMap = new Map(companies.map(c => [c.id, c.name]))

  // Group indicators theo nhóm
  const groups = Object.entries(GROUP_LABELS) as [RiskGroup, string][]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Quản lý ngưỡng chỉ tiêu</h1>
          <p className="text-sm text-gray-500 mt-0.5">Đặt ngưỡng vàng / đỏ cho từng chỉ tiêu</p>
        </div>
        <Link href="/rui-ro" className="text-sm text-blue-600 hover:underline">
          ← Sức khỏe tài chính
        </Link>
      </div>

      {canEdit && (
        <ThresholdForm companies={companies.map(c => ({ id: c.id, name: c.name }))} />
      )}

      {/* Bảng ngưỡng hiện tại — nhóm theo RiskGroup */}
      {groups.map(([g, glabel]) => {
        const indCodes = INDICATORS.filter(i => i.group === g).map(i => i.code)
        const rows     = thresholds.filter(t => indCodes.includes(t.indicator_code))
        return (
          <div key={g}>
            <h2 className="text-sm font-semibold text-gray-600 mb-2">{glabel}</h2>
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              {rows.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">Chưa đặt ngưỡng cho nhóm này.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="px-4 py-2.5 text-left">Chỉ tiêu</th>
                      <th className="px-4 py-2.5 text-left">Áp dụng</th>
                      <th className="px-4 py-2.5 text-right">Ngưỡng vàng</th>
                      <th className="px-4 py-2.5 text-right">Ngưỡng đỏ</th>
                      {canEdit && <th className="px-4 py-2.5" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(t => {
                      const ind = INDICATORS.find(i => i.code === t.indicator_code)
                      return (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-700 text-xs font-medium">
                            {ind?.label ?? t.indicator_code}
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs">
                            {t.company_id ? (companyMap.get(t.company_id) ?? t.company_id) : 'Áp chung'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-amber-700">
                            {t.yellow_at ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-red-700">
                            {t.red_at ?? '—'}
                          </td>
                          {canEdit && (
                            <td className="px-4 py-2 text-right">
                              <form action={deleteThreshold.bind(null, t.id)}>
                                <button
                                  type="submit"
                                  className="text-xs text-red-500 hover:text-red-700 underline"
                                >
                                  Xóa
                                </button>
                              </form>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
