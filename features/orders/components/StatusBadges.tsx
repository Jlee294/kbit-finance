'use client'

import { FULFILLMENT_LABEL, PAYMENT_LABEL } from '@/lib/orders-labels'
import { useT } from '@/lib/i18n/client'
import { Badge, type BadgeProps } from '@/components/kbit'

type FulfillmentStatus = keyof typeof FULFILLMENT_LABEL
type PaymentStatus = keyof typeof PAYMENT_LABEL
type Variant = NonNullable<BadgeProps['variant']>

const FULFILLMENT_VARIANT: Record<FulfillmentStatus, Variant> = {
  draft:          'default',
  confirmed:      'primary',
  awaiting_goods: 'warning',
  delivered:      'success',
}

const PAYMENT_VARIANT: Record<PaymentStatus, Variant> = {
  unpaid:  'danger',
  partial: 'warning',
  paid:    'success',
}

export function FulfillmentBadge({ status }: { status: string }) {
  const t = useT()
  const s = status as FulfillmentStatus
  return (
    <Badge variant={FULFILLMENT_VARIANT[s] ?? 'default'} size="sm">
      {t(FULFILLMENT_LABEL[s] ?? status)}
    </Badge>
  )
}

export function PaymentBadge({ status }: { status: string }) {
  const t = useT()
  const s = status as PaymentStatus
  return (
    <Badge variant={PAYMENT_VARIANT[s] ?? 'default'} size="sm">
      {t(PAYMENT_LABEL[s] ?? status)}
    </Badge>
  )
}
