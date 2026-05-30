'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { BankAccountForm } from './BankAccountForm'
import { Badge } from '@/components/ui/badge'

type BankAccount = { id: string; name: string; currency: string; account_no: string | null; companies: { code: string } | null }

export function BankAccountCatalog({ rows, canWrite }: { rows: BankAccount[]; canWrite: boolean }) {
  return (
    <CatalogPage
      title="Tài khoản ngân hàng"
      rows={rows}
      canWrite={canWrite}
      FormComponent={BankAccountForm}
      columns={[
        { key: 'name', label: 'Tên tài khoản' },
        { key: 'companies', label: 'Công ty', render: (r) => r.companies?.code ?? '' },
        { key: 'currency', label: 'Tiền tệ', render: (r) => <Badge variant="outline">{r.currency}</Badge> },
        { key: 'account_no', label: 'Số tài khoản', render: (r) => r.account_no ?? '' },
      ]}
    />
  )
}
