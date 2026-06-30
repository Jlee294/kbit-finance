/**
 * PageHeader — Header thống nhất cho mọi page nội bộ.
 * Dùng component KBIT (@kbit/ui) để đồng nhất nhận diện; giữ thêm `breadcrumb`.
 */

import type { ReactNode } from 'react'
import { KbitPageHeader } from '@/components/kbit'

interface Props {
  title:       string | ReactNode
  subtitle?:   string | ReactNode
  actions?:    ReactNode
  breadcrumb?: ReactNode
  icon?:       ReactNode
}

export function PageHeader({ title, subtitle, actions, breadcrumb, icon }: Props) {
  return (
    <div className="space-y-2">
      {breadcrumb && <div className="text-sm text-gray-500">{breadcrumb}</div>}
      <KbitPageHeader title={title} subtitle={subtitle} actions={actions} icon={icon} />
    </div>
  )
}
