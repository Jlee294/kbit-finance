'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { quickCreateDocType } from '@/features/document-types/actions'
import type { DocumentType } from '@/features/document-types/queries'

interface Props {
  label: string
  docTypes: DocumentType[]
  selected: string[]
  onChange: (ids: string[]) => void
  /** Khi tạo doc type mới → push vào list (do form cha quản lý docTypes state) */
  onDocTypeCreated?: (dt: { id: string; code: string; name: string }) => void
}

export function DocChecklistPicker({ label, docTypes, selected, onChange, onDocTypeCreated }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [err, setErr] = useState('')

  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    )
  }

  function add() {
    if (!newName.trim()) { setErr('Nhập tên loại chứng từ'); return }
    setErr('')
    start(async () => {
      const res = await quickCreateDocType({ name: newName.trim(), code: newCode.trim() || undefined })
      if (!res.ok) { setErr(res.error); return }
      onDocTypeCreated?.({ id: res.id, code: res.code, name: res.name })
      onChange([...selected, res.id])    // auto-tick vừa tạo
      setNewName(''); setNewCode('')
      setAddOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          {addOpen ? '× Đóng' : '+ Thêm loại chứng từ mới'}
        </button>
      </div>

      {addOpen && (
        <div className="rounded-md border border-brand-200 bg-brand-50/30 p-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="MÃ (auto-gen)"
              className="h-8 px-2 text-xs rounded-md border border-gray-300 col-span-1 font-mono"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tên loại chứng từ (VD: Tờ khai hải quan)"
              className="h-8 px-2 text-xs rounded-md border border-gray-300 col-span-2"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-gray-500">Mã trống → auto-gen từ tên</p>
            <button
              type="button"
              onClick={add}
              disabled={pending}
              className="h-7 px-3 text-xs font-medium bg-brand-800 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? 'Đang tạo…' : '✓ Tạo & gắn'}
            </button>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}

      {docTypes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Chưa có loại chứng từ nào — bấm <strong>+ Thêm loại chứng từ mới</strong> ở trên để tạo nhanh.</p>
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
