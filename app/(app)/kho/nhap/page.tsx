import { listWarehouses } from '@/features/warehouse/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { createClient } from '@/lib/supabase/server'
import { StockMutationForm } from '@/features/warehouse/components/StockMutationForm'

export const dynamic = 'force-dynamic'

export default async function NhapKhoPage() {
  const supabase = await createClient()
  const [warehouses, { data: products }] = await Promise.all([
    listWarehouses(),
    supabase.from('products').select('id, code, name, unit').eq('is_active', true).order('name'),
  ])

  return (
    <div className="p-6 max-w-lg mx-auto space-y-5">
      <PageHeader title="Nhập kho" subtitle="Thêm hàng vào kho" />
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <StockMutationForm mode="receipt" warehouses={warehouses} products={products ?? []} />
      </div>
    </div>
  )
}
