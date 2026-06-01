'use client'

import type { DocumentType } from '@/features/document-types/queries'

interface Props {
  label: string
  docTypes: DocumentType[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function DocChecklistPicker({ label, docTypes, selected, onChange }: Props) {
  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {docTypes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Chưa có loại chứng từ nào — thêm ở Danh mục trước.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto rounded border p-2 bg-gray-50">
          {docTypes.map((dt) => (
            <label key={dt.id} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-gray-300"
                checked={selected.includes(dt.id)}
                onChange={() => toggle(dt.id)}
              />
              <span className="font-mono text-xs text-brand-800">[{dt.code}]</span>
              <span className="text-xs">{dt.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
