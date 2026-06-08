import { getCurrentUser, canEdit, canApprove } from '@/lib/auth'
import { listAllDocuments } from '@/features/documents/queries'
import { listDocumentTypes } from '@/features/document-types/queries'
import { DocumentListClient } from './DocumentListClient'
import { PageHeader } from '@/components/shared/PageHeader'

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
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <PageHeader
        title="Tài liệu đính kèm"
        subtitle={`Kho lưu hóa đơn, biên bản, hợp đồng… gắn với từng đơn hàng / phiếu thu chi để tra cứu và đối chiếu khi cần (${docs.length} tài liệu).`}
      />
      <DocumentListClient docs={docs} docTypes={docTypes} canWrite={canWrite} canVerify={canVerify} />
    </div>
  )
}
