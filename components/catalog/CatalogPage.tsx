'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { PAGE_WRAPPER, DIALOG_SIZE, type DialogSize } from '@/lib/ui-tokens'
import { useT, useLocale } from '@/lib/i18n/client'

export interface Column<T> {
  key: keyof T | string
  label: string
  render?: (row: T) => React.ReactNode
}

interface Props<T extends { id: string }> {
  title: string
  subtitle?: string
  rows: T[]
  columns: Column<T>[]
  canWrite: boolean
  FormComponent: React.ComponentType<{
    initial?: Partial<T>
    onDone: () => void
  }>
  /** Cỡ dialog form: 'sm' (2–3 trường) | 'md' (mặc định, 2 cột) | 'lg' (form lớn) */
  dialogSize?: DialogSize
}

export function CatalogPage<T extends { id: string }>({
  title,
  subtitle,
  rows,
  columns,
  canWrite,
  FormComponent,
  dialogSize = 'md',
}: Props<T>) {
  const t = useT()
  const locale = useLocale()
  const titleT  = t(title)
  // KTT i18n: 'tên đối tượng' số ít, viết thường — chèn vào template "Cập nhật X" / "Thêm X mới"
  const nounLow = titleT.toLowerCase()
  const emptyTitle    = locale === 'en' ? `No ${nounLow} yet`           : `Chưa có ${nounLow} nào`
  const addLabel      = locale === 'en' ? `+ Add ${nounLow}`            : `+ Thêm ${nounLow}`
  const editTitle     = locale === 'en' ? `Edit ${nounLow}`             : `Cập nhật ${nounLow}`
  const createTitle   = locale === 'en' ? `Add new ${nounLow}`          : `Thêm ${nounLow} mới`
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<T | undefined>(undefined)

  function openCreate() {
    setEditing(undefined)
    setOpen(true)
  }

  function openEdit(row: T) {
    setEditing(row)
    setOpen(true)
  }

  function getCell(row: T, col: Column<T>): React.ReactNode {
    if (col.render) return col.render(row)
    const value = (row as Record<string, unknown>)[col.key as string]
    return value != null ? String(value) : ''
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={titleT}
        subtitle={subtitle ?? `${rows.length} ${t('bản ghi')}`}
        actions={canWrite ? <Button size="sm" onClick={openCreate}>{t('+ Thêm')}</Button> : undefined}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="📋"
          title={emptyTitle}
          description={canWrite ? t('Bấm + Thêm ở góc phải để tạo mới') : t('Liên hệ admin để được thêm dữ liệu')}
          action={canWrite ? <Button onClick={openCreate}>{addLabel}</Button> : undefined}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold tracking-wide">
              <tr>
                {columns.map((col) => (
                  <th key={String(col.key)} className="px-4 py-2.5 text-left">{t(col.label)}</th>
                ))}
                {canWrite && <th className="px-4 py-2.5 w-20 text-right">{t('Sửa')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-brand-50/40 transition-colors">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-2.5 text-gray-700">{getCell(row, col)}</td>
                  ))}
                  {canWrite && (
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        {t('Sửa')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={DIALOG_SIZE[dialogSize]}>
          <DialogHeader>
            <DialogTitle>{editing ? editTitle : createTitle}</DialogTitle>
          </DialogHeader>
          <FormComponent initial={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
