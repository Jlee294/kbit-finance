/**
 * StatsCard — KPI card thống nhất với border-top accent màu semantic.
 *
 *   <StatsCard label="Tổng thu" value="123.456 đ" accent="success" />
 *   <StatsCard label="Phải thu KH" value="..." accent="warning" footer="13 KH" />
 */

import type { ReactNode } from 'react'

type Accent = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface Props {
  label:   string
  value:   string | ReactNode
  accent?: Accent
  footer?: string | ReactNode
  className?: string
  /** Hiển thị giá trị to hơn (cho hero cards) */
  large?: boolean
}

const ACCENT_BORDER: Record<Accent, string> = {
  brand:   'border-t-brand-500',
  success: 'border-t-success-500',
  warning: 'border-t-warning-500',
  danger:  'border-t-danger-500',
  info:    'border-t-info-500',
  neutral: 'border-t-gray-300',
}

const ACCENT_VALUE: Record<Accent, string> = {
  brand:   'text-brand-800',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger:  'text-danger-700',
  info:    'text-info-700',
  neutral: 'text-gray-900',
}

export function StatsCard({
  label,
  value,
  accent = 'neutral',
  footer,
  className = '',
  large = false,
}: Props) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3 border-t-4 ${ACCENT_BORDER[accent]} ${className}`}>
      <p className="text-xs text-gray-500 font-medium tracking-wide">{label}</p>
      <p className={`${large ? 'text-2xl' : 'text-lg'} font-semibold ${ACCENT_VALUE[accent]} mt-1 tabular-nums`}>
        {value}
      </p>
      {footer && (
        <p className="text-[10px] text-gray-400 mt-0.5">{footer}</p>
      )}
    </div>
  )
}
