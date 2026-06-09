import { listWarehouses, listTransactions } from '@/features/warehouse/queries'
import { TransactionHistory } from '@/features/warehouse/components/TransactionHistory'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FilterSubmit, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { getGlobalFilter } from '@/lib/global-filter'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function LichSuKhoPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string; type?: string; invoice?: string }>
}) {
  const sp = await searchParams
  const { companyId: gCompany } = await getGlobalFilter()
  const companyId = gCompany || undefined
  const onlyNoInvoice = sp.invoice === 'missing'
  const [warehouses, transactions] = await Promise.all([
    listWarehouses(companyId),
    listTransactions({
      warehouseId:   sp.warehouse || undefined,
      txnType:       sp.type || undefined,
      companyId:     companyId,
      onlyNoInvoice,
      limit:         200,
    }),
  ])

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Lịch sử xuất nhập kho"
        subtitle={`${transactions.length} phát sinh gần nhất`}
      />

      <FilterBar>
        <FilterField label="Kho">
          <select name="warehouse" defaultValue={sp.warehouse ?? ''} className={`${FILTER_CONTROL} min-w-[160px]`}>
            <option value="">Tất cả kho</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Loại">
          <select name="type" defaultValue={sp.type ?? ''} className={FILTER_CONTROL}>
            <option value="">Tất cả</option>
            <option value="receipt">Nhập kho</option>
            <option value="issue">Xuất kho</option>
            <option value="transfer_out">Luân chuyển ra</option>
            <option value="transfer_in">Luân chuyển vào</option>
            <option value="order_deduction">Xuất theo đơn</option>
          </select>
        </FilterField>
        <FilterField label="Hóa đơn">
          <select name="invoice" defaultValue={sp.invoice ?? ''} className={FILTER_CONTROL}>
            <option value="">Tất cả</option>
            <option value="missing">⚠ Chưa có HĐ</option>
          </select>
        </FilterField>
        <FilterSubmit />
      </FilterBar>

      <TransactionHistory rows={transactions} />
    </div>
  )
}
