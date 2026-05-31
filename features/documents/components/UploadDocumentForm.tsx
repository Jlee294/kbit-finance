'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadDocument } from '../actions'
import type { DocEntityType } from '../schema'
import type { DocumentType } from '@/features/document-types/queries'

interface Props {
  entityType: DocEntityType
  entityId: string
  docTypes: DocumentType[]
  onDone?: () => void
}

export function UploadDocumentForm({ entityType, entityId, docTypes, onDone }: Props) {
  const router = useRouter()
  const [docTypeId, setDocTypeId] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await uploadDocument({
        document_type_id: docTypeId,
        entity_type: entityType,
        entity_id: entityId,
        file_name: fileName,
        file_url: fileUrl || null,
      })
      router.refresh()
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>Loại chứng từ <span className="text-red-500">*</span></Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={docTypeId}
          onChange={(e) => setDocTypeId(e.target.value)}
          required
        >
          <option value="">-- Chọn loại chứng từ --</option>
          {docTypes.map((dt) => (
            <option key={dt.id} value={dt.id}>
              [{dt.code}] {dt.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>Tên file <span className="text-red-500">*</span></Label>
        <Input
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="VD: hoa-don-vat-202506.pdf"
          required
        />
      </div>
      <div className="space-y-1">
        <Label>URL file (Google Drive, OneDrive...)</Label>
        <Input
          value={fileUrl}
          onChange={(e) => setFileUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          type="url"
        />
        <p className="text-xs text-gray-400">Tùy chọn — gắn link Drive hoặc để trống, upload thực ở Phase 6b</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone?.()} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Đính kèm chứng từ'}
        </Button>
      </div>
    </form>
  )
}
