import { getCurrentUser, canApprove } from '@/lib/auth'
import { listTaxTypes } from '@/features/tax-types/queries'
import { TaxTypesClient } from './TaxTypesClient'

export const dynamic = 'force-dynamic'

export default async function TaxTypesPage() {
  const [me, items] = await Promise.all([getCurrentUser(), listTaxTypes(false)])
  const canWrite = !!me && canApprove(me.role)

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Loại thuế</h1>
        <p className="text-sm text-gray-500 mt-0.5">Danh mục loại thuế dùng cho Lịch thuế &amp; Kế hoạch thuế. Thêm/sửa thoải mái; loại không dùng nữa thì ẩn (không xóa) để giữ số liệu cũ.</p>
      </div>
      <TaxTypesClient items={items} canWrite={canWrite} />
    </div>
  )
}
