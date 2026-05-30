'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OrderForm } from './OrderForm'
import { setFulfillmentStatus, deleteOrder } from '../actions'
import type { OrderDetail } from '../queries'

type SimpleOption = { id: string; name: string }
type CustomerOption = { id: string; code: string; name: string }
type ProjectOption  = { id: string; code: string; name: string; company_id: string }
type ProductOption  = { id: string; code: string; name: string }

interface Props {
  order: OrderDetail
  canWrite: boolean
  canApprove: boolean
  companies: SimpleOption[]
  customers: CustomerOption[]
  projects: ProjectOption[]
  products: ProductOption[]
}

// Fulfillment transitions: what a button should advance to
const NEXT_STATUS: Record<string, string | null> = {
  draft:          'confirmed',
  confirmed:      'awaiting_goods',
  awaiting_goods: 'delivered',
  delivered:       null,
}

const NEXT_LABEL: Record<string, string> = {
  confirmed:      'Xác nhận',
  awaiting_goods: 'Chờ hàng',
  delivered:       'Giao hàng',
}

export function OrderDetailActions({
  order, canWrite, canApprove,
  companies, customers, projects, products,
}: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen]   = useState(false)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')

  const nextStatus = NEXT_STATUS[order.fulfillment_status]
  const canDelete  = canWrite && order.fulfillment_status === 'draft' && Number(order.amount_paid) === 0
  // Only approver can advance past confirmed
  const canAdvance = nextStatus && (nextStatus === 'confirmed' ? canWrite : canApprove)

  async function handleAdvance() {
    if (!nextStatus) return
    setBusy(true); setError('')
    try {
      await setFulfillmentStatus(order.id, nextStatus as Parameters<typeof setFulfillmentStatus>[1])
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Xác nhận xoá đơn ${order.order_code}?`)) return
    setBusy(true); setError('')
    try {
      await deleteOrder(order.id)
      router.push('/don-hang')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra')
    } finally {
      setBusy(false)
    }
  }

  if (!canWrite && !canApprove) return null

  return (
    <>
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-2">
        {/* Edit button — only when not delivered */}
        {canWrite && order.fulfillment_status !== 'delivered' && (
          <Button variant="outline" onClick={() => setEditOpen(true)} disabled={busy}>
            Sửa đơn
          </Button>
        )}

        {/* Advance fulfillment status */}
        {canAdvance && (
          <Button onClick={handleAdvance} disabled={busy}>
            {busy ? 'Đang xử lý...' : (NEXT_LABEL[nextStatus] ?? nextStatus)}
          </Button>
        )}

        {/* Delete */}
        {canDelete && (
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>
            Xoá đơn
          </Button>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Sửa đơn {order.order_code}</DialogTitle>
          </DialogHeader>
          <OrderForm
            initial={order}
            companies={companies}
            customers={customers}
            projects={projects}
            products={products}
            onDone={() => { setEditOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
