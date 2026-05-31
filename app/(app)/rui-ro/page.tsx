import { Suspense }              from 'react'
import Link                       from 'next/link'
import { listCompanies }          from '@/features/companies/queries'
import { getLatestAssessment }    from '@/features/risk/queries'
import { HealthDashboard }        from '@/features/risk/components/HealthDashboard'
import { RuiRoFilters }           from '@/features/risk/components/RuiRoFilters'
import { getCurrentUser, canApprove } from '@/lib/auth'

interface SearchParams { company?: string; period?: string }

export const dynamic = 'force-dynamic'

export default async function RuiRoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp        = await searchParams
  const companyId = sp.company
  const period    = sp.period

  const [companies, me] = await Promise.all([listCompanies(), getCurrentUser()])
  const canRun          = !!me && canApprove(me.role)

  const assessment = companyId ? await getLatestAssessment(companyId) : null

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sức khỏe tài chính</h1>
          <p className="text-sm text-gray-500 mt-0.5">Chấm điểm rủi ro 5 nhóm chỉ tiêu</p>
        </div>
        <Link href="/rui-ro/nguong" className="text-sm text-blue-600 hover:underline">
          Quản lý ngưỡng →
        </Link>
      </div>

      <Suspense fallback={null}>
        <RuiRoFilters
          companies={companies.map(c => ({ id: c.id, name: c.name }))}
          companyId={companyId}
          period={period}
          canRun={canRun}
        />
      </Suspense>

      {!companyId && (
        <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
          Chọn một công ty để xem sức khỏe tài chính.
        </div>
      )}

      {companyId && !assessment && (
        <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-500">
          Chưa có dữ liệu chấm điểm.{canRun ? ' Bấm "Chấm điểm ngay" để bắt đầu.' : ''}
        </div>
      )}

      {assessment && (
        <Suspense fallback={<div className="h-32 bg-gray-50 rounded-xl animate-pulse" />}>
          <HealthDashboard assessment={assessment} />
        </Suspense>
      )}
    </div>
  )
}
