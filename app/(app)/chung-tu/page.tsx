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
        title="Chứng từ"
        subtitle={`${docs.length} chứng từ đính kèm trong hệ thống`}
      />
      <DocumentListClient docs={docs} docTypes={docTypes} canWrite={canWrite} canVerify={canVerify} />
    </div>
  )
}
