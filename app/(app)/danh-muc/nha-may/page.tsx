import { listManufacturers } from '@/features/manufacturers/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { ManufacturerCatalog } from '@/features/manufacturers/components/ManufacturerCatalog'

export const dynamic = 'force-dynamic'

export default async function ManufacturersPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listManufacturers()])
  return <ManufacturerCatalog rows={rows} canWrite={me ? canApprove(me.role) : false} />
}
