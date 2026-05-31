import { listWarehouses } from '@/features/warehouse/queries'
import { createClient } from '@/lib/supabase/server'
import { StockMutationForm } from '@/features/warehouse/components/StockMutationForm'

export const dynamic = 'force-dynamic'

export default async function XuatKhoPage() {
  const supabase = await createClient()
  const [warehouses, { data: products }] = await Promise.all([
    listWarehouses(),
    supabase.from('products').select('id, code, name, unit').eq('is_active', true).order('name'),
  ])

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Xuất kho</h1>
        <p className="text-sm text-gray-500 mt-0.5">Xuất hàng khỏi kho, ghi lý do</p>
      </div>
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <StockMutationForm mode="issue" warehouses={warehouses} products={products ?? []} />
      </div>
    </div>
  )
}
