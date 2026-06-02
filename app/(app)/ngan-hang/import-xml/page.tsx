import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listCompanies } from '@/features/companies/queries'
import { listCustomers } from '@/features/customers/queries'
import { listSuppliers } from '@/features/suppliers/queries'
import { BankXmlImporter } from '@/features/xml-imports/components/BankXmlImporter'
import { PageHeader } from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function ImportBankXmlPage() {
  const me = await getCurrentUser()
  if (!me || !canEdit(me.role)) redirect('/ngan-hang')

  const supabase = await createClient()
  const [companies, customers, suppliers, banksRes] = await Promise.all([
    listCompanies(),
    listCustomers(),
    listSuppliers(),
    supabase.from('bank_accounts')
      .select('id, name, currency, company_id')
      .eq('is_active', true).order('name'),
  ])

  const banks = (banksRes.data ?? []) as Array<{ id: string; name: string; currency: string; company_id: string }>

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Import sao kê ngân hàng"
        subtitle="Tải file sao kê Techcombank — tự động tạo phiếu thu, chi"
        breadcrumb={
          <>
            <Link href="/ngan-hang" className="hover:text-brand-700">Ngân hàng</Link>
            <span className="mx-1.5">/</span>
            <span className="font-medium text-gray-900">Import sao kê</span>
          </>
        }
      />

      <BankXmlImporter
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        banks={banks}
        customers={customers.map((c: any) => ({ id: c.id, code: c.code, name: c.name }))}
        suppliers={suppliers.map((s: any) => ({ id: s.id, code: s.code, name: s.name }))}
      />
    </div>
  )
}
