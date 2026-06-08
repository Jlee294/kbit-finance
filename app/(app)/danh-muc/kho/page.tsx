import { listWarehousesAdmin } from '@/features/warehouse/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { WarehouseCatalog } from '@/features/warehouse/components/WarehouseCatalog'

export const dynamic = 'force-dynamic'

export default async function WarehousePage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listWarehousesAdmin()])
  return <WarehouseCatalog rows={rows} canWrite={me ? canApprove(me.role) : false} />
}
