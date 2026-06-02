/**
 * FormSection — Section thống nhất trong form dài.
 *
 *   <FormSection title="Thông tin hóa đơn" description="...">
 *     <div className="grid grid-cols-2 gap-4">...</div>
 *   </FormSection>
 *
 *   <FormSection variant="elevated" title="Chi tiết khách hàng">
 *     ...
 *   </FormSection>
 */

import type { ReactNode } from 'react'

interface Props {
  title?:       string
  description?: string
  children:     ReactNode
  /** elevated: card với bg-brand-50/40 cho section quan trọng */
  variant?:     'default' | 'elevated'
  className?:   string
}

export function FormSection({
  title, description, children, variant = 'default', className = '',
}: Props) {
  const wrapper = variant === 'elevated'
    ? 'rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 space-y-3'
    : 'space-y-3'

  return (
    <div className={`${wrapper} ${className}`}>
      {title && (
        <div className="border-l-2 border-brand-500 pl-3">
          <p className="text-xs font-semibold text-gray-800 uppercase tracking-wider">{title}</p>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
