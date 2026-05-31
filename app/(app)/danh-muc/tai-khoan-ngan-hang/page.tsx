import { listBankAccounts } from '@/features/bank-accounts/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { BankAccountCatalog } from '@/features/bank-accounts/components/BankAccountCatalog'

export const dynamic = 'force-dynamic'

export default async function BankAccountPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listBankAccounts()])
  return <BankAccountCatalog rows={rows as Parameters<typeof BankAccountCatalog>[0]['rows']} canWrite={me ? canApprove(me.role) : false} />
}
