'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface Column<T> {
  key: keyof T | string
  label: string
  render?: (row: T) => React.ReactNode
}

interface Props<T extends { id: string }> {
  title: string
  rows: T[]
  columns: Column<T>[]
  canWrite: boolean
  FormComponent: React.ComponentType<{
    initial?: Partial<T>
    onDone: () => void
  }>
}

export function CatalogPage<T extends { id: string }>({
  title,
  rows,
  columns,
  canWrite,
  FormComponent,
}: Props<T>) {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>+ Thêm</Button>
        )}
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={String(col.key)}>{col.label}</TableHead>
              ))}
              {canWrite && <TableHead className="w-20">Sửa</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + (canWrite ? 1 : 0)} className="text-center text-gray-400 py-8">
                  Chưa có dữ liệu
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((col) => (
                  <TableCell key={String(col.key)}>{getCell(row, col)}</TableCell>
                ))}
                {canWrite && (
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                      Sửa
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Cập nhật' : 'Thêm mới'} {title}</DialogTitle>
          </DialogHeader>
          <FormComponent initial={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
