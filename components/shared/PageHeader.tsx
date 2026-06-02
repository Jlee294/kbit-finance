/**
 * PageHeader — Header thống nhất cho mọi page nội bộ.
 *
 * Layout: [Title + subtitle (trái)]    [Actions (phải)]
 *         [breadcrumb đặt ở trên nếu có]
 */

import type { ReactNode } from 'react'

interface Props {
  title:       string | ReactNode
  subtitle?:   string | ReactNode
  actions?:    ReactNode
  breadcrumb?: ReactNode
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: Props) {
  return (
    <div className="space-y-2">
      {breadcrumb && (
        <div className="text-sm text-gray-500">
          {breadcrumb}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  )
}
