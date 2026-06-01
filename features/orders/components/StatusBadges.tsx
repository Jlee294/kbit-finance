'use client'

import { FULFILLMENT_LABEL, PAYMENT_LABEL } from '@/lib/orders-labels'

type FulfillmentStatus = keyof typeof FULFILLMENT_LABEL
type PaymentStatus = keyof typeof PAYMENT_LABEL

const FULFILLMENT_COLOR: Record<FulfillmentStatus, string> = {
  draft:          'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
  confirmed:      'bg-brand-50 text-brand-800 ring-1 ring-brand-200',
  awaiting_goods: 'bg-warning-50 text-warning-700 ring-1 ring-warning-500/30',
  delivered:      'bg-success-50 text-success-700 ring-1 ring-success-500/30',
}

const PAYMENT_COLOR: Record<PaymentStatus, string> = {
  unpaid:  'bg-danger-50 text-danger-700 ring-1 ring-danger-500/30',
  partial: 'bg-warning-50 text-warning-700 ring-1 ring-warning-500/30',
  paid:    'bg-success-50 text-success-700 ring-1 ring-success-500/30',
}

export function FulfillmentBadge({ status }: { status: string }) {
  const s = status as FulfillmentStatus
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${FULFILLMENT_COLOR[s] ?? 'bg-gray-100 text-gray-700'}`}>
      {FULFILLMENT_LABEL[s] ?? status}
    </span>
  )
}

export function PaymentBadge({ status }: { status: string }) {
  const s = status as PaymentStatus
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PAYMENT_COLOR[s] ?? 'bg-gray-100 text-gray-700'}`}>
      {PAYMENT_LABEL[s] ?? status}
    </span>
  )
}
