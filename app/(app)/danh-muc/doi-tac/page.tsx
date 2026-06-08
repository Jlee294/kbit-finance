import { listCustomers } from '@/features/customers/queries'
import { listSuppliers } from '@/features/suppliers/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { PartnerCatalog } from '@/features/partners/components/PartnerCatalog'

export const dynamic = 'force-dynamic'

export default async function DoiTacPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const [me, customers, suppliers] = await Promise.all([getCurrentUser(), listCustomers(), listSuppliers()])
  const canWrite = me ? canApprove(me.role) : false
  const defaultTab = sp.tab === 'nha-cung-cap' ? 'nha-cung-cap' : 'khach-hang'
  return <PartnerCatalog customers={customers} suppliers={suppliers} canWrite={canWrite} defaultTab={defaultTab} />
}
