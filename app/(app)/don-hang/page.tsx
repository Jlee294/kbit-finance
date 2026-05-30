import { getCurrentUser, canEdit } from '@/lib/auth'
import { listOrders } from '@/features/orders/queries'
import { OrderList } from '@/features/orders/components/OrderList'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const [me, { rows, total }] = await Promise.all([
    getCurrentUser(),
    listOrders({ pageSize: 50 }),
  ])

  return (
    <OrderList
      initialRows={rows}
      total={total}
      canWrite={!!me && canEdit(me.role)}
    />
  )
}
