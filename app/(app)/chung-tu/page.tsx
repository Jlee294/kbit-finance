import { getCurrentUser, canEdit, canApprove } from '@/lib/auth'
import { listAllDocuments } from '@/features/documents/queries'
import { listDocumentTypes } from '@/features/document-types/queries'
import { DocumentListClient } from './DocumentListClient'

export const dynamic = 'force-dynamic'

export default async function ChungTuPage() {
  const [me, docs, docTypes] = await Promise.all([
    getCurrentUser(),
    listAllDocuments({ limit: 100 }),
    listDocumentTypes(),
  ])

  const canWrite   = !!me && canEdit(me.role)
  const canVerify  = !!me && canApprove(me.role)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Chứng từ</h1>
        <p className="text-sm text-gray-500 mt-0.5">Danh sách chứng từ đính kèm trong hệ thống</p>
      </div>
      <DocumentListClient docs={docs} docTypes={docTypes} canWrite={canWrite} canVerify={canVerify} />
    </div>
  )
}
