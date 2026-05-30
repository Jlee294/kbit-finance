import type { Database } from '@/types/database'

type Fulfillment = Database['public']['Enums']['fulfillment_status']
type Payment = Database['public']['Enums']['payment_status']

export const FULFILLMENT_LABEL: Record<Fulfillment, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  awaiting_goods: 'Đang chờ hàng', // [⏳ A7] tên tạm — đổi tại đây khi chốt
  delivered: 'Đã giao',
}

export const PAYMENT_LABEL: Record<Payment, string> = {
  unpaid: 'Chưa trả',
  partial: 'Trả một phần',
  paid: 'Đã trả đủ',
}
