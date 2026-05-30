'use client'

import { FULFILLMENT_LABEL, PAYMENT_LABEL } from '@/lib/orders-labels'

type FulfillmentStatus = keyof typeof FULFILLMENT_LABEL
type PaymentStatus = keyof typeof PAYMENT_LABEL

const FULFILLMENT_COLOR: Record<FulfillmentStatus, string> = {
  draft:          'bg-gray-100 text-gray-700',
  confirmed:      'bg-blue-100 text-blue-700',
  awaiting_goods: 'bg-yellow-100 text-yellow-800',
  delivered:      'bg-green-100 text-green-700',
}

const PAYMENT_COLOR: Record<PaymentStatus, string> = {
  unpaid:  'bg-red-100 text-red-700',
  partial: 'bg-orange-100 text-orange-700',
  paid:    'bg-green-100 text-green-700',
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
