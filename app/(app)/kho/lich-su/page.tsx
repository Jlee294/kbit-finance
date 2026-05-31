import { listWarehouses, listTransactions } from '@/features/warehouse/queries'
import { TransactionHistory } from '@/features/warehouse/components/TransactionHistory'

export const dynamic = 'force-dynamic'

export default async function LichSuKhoPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string; type?: string }>
}) {
  const sp = await searchParams
  const [warehouses, transactions] = await Promise.all([
    listWarehouses(),
    listTransactions({
      warehouseId: sp.warehouse || undefined,
      txnType:     sp.type || undefined,
      limit:       200,
    }),
  ])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Lịch sử xuất nhập kho</h1>
        <p className="text-sm text-gray-500 mt-0.5">{transactions.length} phát sinh gần nhất</p>
      </div>

      {/* Bộ lọc */}
      <form method="get" className="flex flex-wrap gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm items-end">
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Kho</p>
          <select name="warehouse" defaultValue={sp.warehouse ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[140px]">
            <option value="">Tất cả kho</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Loại</p>
          <select name="type" defaultValue={sp.type ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white">
            <option value="">Tất cả</option>
            <option value="receipt">Nhập kho</option>
            <option value="issue">Xuất kho</option>
            <option value="transfer_out">Luân chuyển ra</option>
            <option value="transfer_in">Luân chuyển vào</option>
            <option value="order_deduction">Xuất theo đơn</option>
          </select>
        </div>
        <button type="submit"
          className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">
          Lọc
        </button>
      </form>

      <TransactionHistory rows={transactions} />
    </div>
  )
}
