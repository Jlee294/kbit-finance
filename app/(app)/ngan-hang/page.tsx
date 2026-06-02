import { getCurrentUser, canEdit } from '@/lib/auth'
import { listBankLedger, listBankAccounts } from '@/features/bank/queries'
import { listCompanies } from '@/features/companies/queries'
import { listCustomers } from '@/features/customers/queries'
import { listSuppliers } from '@/features/suppliers/queries'
import { listProjects }  from '@/features/projects/queries'
import { listKrSuppliers, listKrwBankAccounts } from '@/features/expenses-kr/queries'
import { createClient } from '@/lib/supabase/server'
import { BankLedgerTable } from '@/features/bank/components/BankLedgerTable'
import { BankCreateButtons } from '@/features/bank/components/BankCreateButtons'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatsCard } from '@/components/shared/StatsCard'
import { FilterBar, FilterField, FilterSubmit, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + ' đ' }

export default async function NganHangPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; bank?: string; type?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()

  const [me, rows, companies, banks, customers, suppliers, krSuppliers, krwBanks, projects, bankRes] = await Promise.all([
    getCurrentUser(),
    listBankLedger({
      companyId:     sp.company || undefined,
      bankAccountId: sp.bank    || undefined,
      direction:     sp.type    || undefined,
      from:          sp.from    || undefined,
      to:            sp.to      || undefined,
      limit:         500,
    }),
    listCompanies(),
    listBankAccounts(),
    listCustomers(),
    listSuppliers(),
    listKrSuppliers(),
    listKrwBankAccounts(),
    listProjects(),
    supabase.from('bank_accounts').select('id, name, currency, company_id').eq('is_active', true).order('name'),
  ])

  const canWrite = !!me && canEdit(me.role)

  const bankAccountsForForms = (bankRes.data ?? []).map((b: any) => ({
    id: b.id, name: b.name, currency: b.currency, company_id: b.company_id,
  }))
  const suppliersForForms = suppliers.map((s: any) => ({ id: s.id, code: s.code as string, name: s.name }))
  const krSuppliersForForms = krSuppliers.map((s: any) => ({ id: s.id, code: s.code as string, name: s.name }))

  const totalThu = rows.filter(r => r.direction === 'thu').reduce((s, r) => s + r.amount_vnd, 0)
  const totalChi = rows.filter(r => r.direction === 'chi').reduce((s, r) => s + r.amount_vnd, 0)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Ngân hàng"
        subtitle={`${rows.length} giao dịch · gộp tất cả thu / chi VN / chi KR`}
        actions={canWrite ? (
          <BankCreateButtons
            companies={companies.map((c: any) => ({ id: c.id, name: c.name }))}
            customers={customers}
            suppliers={suppliersForForms}
            krSuppliers={krSuppliersForForms}
            bankAccounts={bankAccountsForForms}
            krwBanks={krwBanks}
            projects={projects.map((p: any) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
          />
        ) : undefined}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatsCard label="Tổng thu (quy VND)" value={fmtVND(totalThu)} accent="success" />
        <StatsCard label="Tổng chi (quy VND)" value={fmtVND(totalChi)} accent="danger" />
        <StatsCard
          label="Dòng tiền ròng"
          value={fmtVND(totalThu - totalChi)}
          accent={totalThu - totalChi >= 0 ? 'brand' : 'danger'}
        />
      </div>

      <FilterBar>
        <FilterField label="Công ty">
          <select name="company" defaultValue={sp.company ?? ''} className={`${FILTER_CONTROL} min-w-[140px]`}>
            <option value="">Tất cả</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Tài khoản NH">
          <select name="bank" defaultValue={sp.bank ?? ''} className={`${FILTER_CONTROL} min-w-[200px]`}>
            <option value="">Tất cả</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name} ({b.currency})</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Loại">
          <select name="type" defaultValue={sp.type ?? ''} className={FILTER_CONTROL}>
            <option value="">Tất cả</option>
            <option value="thu">Thu</option>
            <option value="chi">Chi</option>
          </select>
        </FilterField>
        <FilterField label="Từ ngày">
          <input type="date" name="from" defaultValue={sp.from ?? ''} className={FILTER_CONTROL} />
        </FilterField>
        <FilterField label="Đến ngày">
          <input type="date" name="to" defaultValue={sp.to ?? ''} className={FILTER_CONTROL} />
        </FilterField>
        <FilterSubmit />
      </FilterBar>

      <BankLedgerTable rows={rows} />
    </div>
  )
}
