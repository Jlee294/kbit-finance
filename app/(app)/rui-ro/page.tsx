import { Suspense }              from 'react'
import Link                       from 'next/link'
import { getGlobalFilter }        from '@/lib/global-filter'
import { getLatestAssessment }    from '@/features/risk/queries'
import { HealthDashboard }        from '@/features/risk/components/HealthDashboard'
import { RuiRoFilters }           from '@/features/risk/components/RuiRoFilters'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

interface SearchParams { period?: string }

export const dynamic = 'force-dynamic'

export default async function RuiRoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp        = await searchParams
  const { companyId } = await getGlobalFilter()
  const period    = sp.period

  const me     = await getCurrentUser()
  const canRun = !!me && canApprove(me.role)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Sức khỏe tài chính"
        subtitle="Chấm điểm rủi ro 5 nhóm chỉ tiêu"
        actions={
          <Link href="/rui-ro/nguong" className="text-sm text-brand-700 hover:underline">
            Quản lý ngưỡng →
          </Link>
        }
      />

      {/* Filter hiện ngay */}
      <Suspense fallback={null}>
        <RuiRoFilters
          companyId={companyId ?? undefined}
          period={period}
          canRun={canRun}
        />
      </Suspense>

      {!companyId ? (
        <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
          Chọn một công ty để xem sức khỏe tài chính.
        </div>
      ) : (
        /* Stream assessment — skeleton hiện trong lúc chờ */
        <Suspense fallback={<div className="h-48 bg-gray-50 rounded-xl animate-pulse" />}>
          <AssessmentSection companyId={companyId} canRun={canRun} />
        </Suspense>
      )}
    </div>
  )
}

async function AssessmentSection({
  companyId, canRun,
}: {
  companyId: string
  canRun: boolean
}) {
  const assessment = await getLatestAssessment(companyId)

  if (!assessment) {
    return (
      <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-500">
        Chưa có dữ liệu chấm điểm.{canRun ? ' Bấm "Chấm điểm ngay" để bắt đầu.' : ''}
      </div>
    )
  }

  return <HealthDashboard assessment={assessment} />
}
