import { listCustomers } from '@/features/customers/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CustomerCatalog } from '@/features/customers/components/CustomerCatalog'

export default async function CustomerPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listCustomers()])
  return <CustomerCatalog rows={rows} canWrite={me ? canApprove(me.role) : false} />
}
