import { getCurrentUser, canEdit } from '@/lib/auth'
import { listWarehouses, listInventoryNxt } from '@/features/warehouse/queries'
import { listProducts } from '@/features/products/queries'
import { listCompanies } from '@/features/companies/queries'
import { NxtTable } from '@/features/warehouse/components/NxtTable'
import { StockActions } from '@/features/warehouse/components/StockActions'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { todayLocal } from '@/lib/format'
import { getGlobalFilter } from '@/lib/global-filter'

export const dynamic = 'force-dynamic'

export default async function KhoPage({ searchParams }: { searchParams: Promise<{ period?: string; wh?: string }> }) {
  const sp = await searchParams
  const { companyId: gCompany, year } = await getGlobalFilter()
  const companies = await listCompanies()
  const companyId = gCompany || companies[0]?.id
  // Kho theo KỲ THÁNG (snapshot NXT). Mặc định: tháng hiện tại nếu là năm nay, ngược lại tháng 1 của năm chọn.
  const defMonth = year === todayLocal().slice(0, 4) ? todayLocal().slice(5, 7) : '01'
  const period = sp.period || `${year}-${defMonth}`
  const wh = sp.wh && sp.wh !== 'all' ? sp.wh : undefined
  const [me, warehouses, products, rows] = await Promise.all([
    getCurrentUser(),
    listWarehouses(companyId),
    listProducts(),
    listInventoryNxt(period, wh, companyId),
  ])
  const canWrite = !!me && canEdit(me.role)
  const negative = rows.filter(r => r.qty_close < 0)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Kho hàng"
        subtitle={
          <>
            {rows.length} mặt hàng · {warehouses.length} kho
            {negative.length > 0 && (
              <span className="ml-2 text-red-600 font-medium">⚠ {negative.length} mặt hàng tồn âm</span>
            )}
          </>
        }
        actions={<StockActions warehouses={warehouses} products={products} period={period} canWrite={canWrite} companyId={companyId ?? ''} />}
      />

      <NxtTable period={period} warehouseId={sp.wh || 'all'} warehouses={warehouses} rows={rows} />
    </div>
  )
}
