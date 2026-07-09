import { getCurrentUser, canApprove } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ImportInventoryClient } from './ImportClient'

export const dynamic = 'force-dynamic'

export default async function ImportInventoryPage() {
  const me = await getCurrentUser()
  if (!me || !canApprove(me.role)) redirect('/kho')

  return <ImportInventoryClient />
}
