import { listPeriods } from '@/features/periods/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { PeriodCatalog } from '@/features/periods/components/PeriodCatalog'

export default async function PeriodPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listPeriods()])
  return <PeriodCatalog rows={rows as Parameters<typeof PeriodCatalog>[0]['rows']} canWrite={me ? canApprove(me.role) : false} />
}
