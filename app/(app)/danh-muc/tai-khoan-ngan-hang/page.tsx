import { listBankAccounts } from '@/features/bank-accounts/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { BankAccountForm } from '@/features/bank-accounts/components/BankAccountForm'
import { Badge } from '@/components/ui/badge'

export default async function BankAccountPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listBankAccounts()])
  const write = me ? canApprove(me.role) : false

  return (
    <CatalogPage
      title="Tài khoản ngân hàng"
      rows={rows}
      canWrite={write}
      FormComponent={BankAccountForm}
      columns={[
        { key: 'name', label: 'Tên tài khoản' },
        { key: 'companies', label: 'Công ty', render: (r) => (r.companies as { code: string } | null)?.code ?? '' },
        { key: 'currency', label: 'Tiền tệ', render: (r) => <Badge variant="outline">{r.currency}</Badge> },
        { key: 'account_no', label: 'Số tài khoản', render: (r) => r.account_no ?? '' },
      ]}
    />
  )
}
