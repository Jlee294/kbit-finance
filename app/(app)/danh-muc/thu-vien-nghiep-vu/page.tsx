import { getCurrentUser, canApprove } from '@/lib/auth'
import { listOperations } from '@/features/operation-library/queries'
import { listDocumentTypes } from '@/features/document-types/queries'
import { OperationLibraryClient } from './OperationLibraryClient'

export const dynamic = 'force-dynamic'

export default async function OperationLibraryPage() {
  const [me, operations, docTypes] = await Promise.all([
    getCurrentUser(),
    listOperations(),
    listDocumentTypes(),
  ])
  const canWrite = !!me && canApprove(me.role)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Thư viện nghiệp vụ</h1>
        <p className="text-sm text-gray-500 mt-0.5">Cấu hình checklist hồ sơ, thuế cho từng loại nghiệp vụ</p>
      </div>
      <OperationLibraryClient operations={operations} docTypes={docTypes} canWrite={canWrite} />
    </div>
  )
}
