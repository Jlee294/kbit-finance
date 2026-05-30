import { listSuppliers } from '@/features/suppliers/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { SupplierCatalog } from '@/features/suppliers/components/SupplierCatalog'

export default async function SupplierPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listSuppliers()])
  return <SupplierCatalog rows={rows} canWrite={me ? canApprove(me.role) : false} />
}
