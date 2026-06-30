/**
 * FilterBar — Thanh lọc thống nhất ở mọi page có filter (Công nợ, Ngân hàng, ...)
 *
 *   <FilterBar>
 *     <FilterField label="Công ty">
 *       <select name="company">...</select>
 *     </FilterField>
 *     <FilterField label="Từ ngày">
 *       <input type="date" name="from" />
 *     </FilterField>
 *     <FilterSubmit>Lọc</FilterSubmit>
 *   </FilterBar>
 */

import type { ReactNode } from 'react'

interface BarProps {
  children: ReactNode
  action?:  string
  method?:  'get' | 'post'
  className?: string
}

export function FilterBar({ children, action, method = 'get', className = '' }: BarProps) {
  return (
    <form
      action={action}
      method={method}
      className={`flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm ${className}`}
    >
      {children}
    </form>
  )
}

interface FieldProps {
  label: string
  children: ReactNode
  hint?: string
}

export function FilterField({ label, children, hint }: FieldProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {children}
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

export function FilterSubmit({ children = 'Lọc' }: { children?: ReactNode }) {
  return (
    <button
      type="submit"
      className="h-8 px-3.5 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-700 transition-colors"
    >
      {children}
    </button>
  )
}

/** Reset filter button (clear all params) */
export function FilterReset({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="h-8 px-3 inline-flex items-center text-sm text-gray-500 rounded-md hover:bg-gray-50 hover:text-gray-800 transition-colors"
    >
      Xóa lọc
    </a>
  )
}

// Common control classes — tái sử dụng cho select, input trong FilterField
export const FILTER_CONTROL = 'h-8 rounded-md border border-gray-300 bg-white px-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'
