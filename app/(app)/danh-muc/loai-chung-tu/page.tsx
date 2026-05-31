import { getCurrentUser, canApprove } from '@/lib/auth'
import { listDocumentTypes } from '@/features/document-types/queries'
import { DocumentTypesClient } from './DocumentTypesClient'

export const dynamic = 'force-dynamic'

export default async function DocumentTypesPage() {
  const [me, items] = await Promise.all([getCurrentUser(), listDocumentTypes()])
  const canWrite = !!me && canApprove(me.role)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Loại chứng từ</h1>
        <p className="text-sm text-gray-500 mt-0.5">Danh mục các loại hồ sơ, chứng từ trong hệ thống</p>
      </div>
      <DocumentTypesClient items={items} canWrite={canWrite} />
    </div>
  )
}
