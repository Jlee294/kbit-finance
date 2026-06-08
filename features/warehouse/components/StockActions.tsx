'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DIALOG_MD } from '@/lib/ui-tokens'
import { StockMutationForm } from './StockMutationForm'
import { closePeriod } from '@/features/inventory-cost/actions'
import type { Warehouse } from '../queries'

interface Product { id: string; code: string; name: string; unit: string | null }
type Mode = 'receipt' | 'issue' | 'transfer'

const BTN = 'h-9 px-3.5 rounded-lg text-sm font-medium transition-colors flex items-center'

export function StockActions({ warehouses, products, period, canWrite, companyId }: {
  warehouses: Warehouse[]; products: Product[]; period: string; canWrite: boolean; companyId: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('receipt')
  const [closing, setClosing] = useState(false)

  function openForm(m: Mode) { setMode(m); setOpen(true) }

  async function khoaSo() {
    if (!confirm(`Khóa sổ kho kỳ ${period}? Sau khi khóa, số liệu kỳ này được chốt lại (snapshot).`)) return
    setClosing(true)
    const r = await closePeriod({ period, company_id: companyId })
    setClosing(false)
    if (r.error) { alert(r.error); return }
    router.refresh()
  }

  return (
    <>
      {canWrite && (
        <button onClick={() => openForm('receipt')} className={`${BTN} bg-success-500 text-white hover:bg-success-700`}>
          Nhập kho
        </button>
      )}
      {canWrite && (
        <button onClick={() => openForm('issue')} className={`${BTN} bg-danger-500 text-white hover:bg-danger-700`}>
          Xuất kho
        </button>
      )}
      <Link href="/kho/lich-su" className={`${BTN} bg-white text-gray-700 border border-gray-200 hover:bg-gray-50`}>
        Lịch sử
      </Link>
      {canWrite && (
        <button onClick={khoaSo} disabled={closing} className={`${BTN} bg-brand-800 text-white hover:bg-brand-700 disabled:opacity-50`}>
          {closing ? 'Đang khóa...' : 'Khóa sổ kỳ'}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton className={DIALOG_MD}>
          <DialogHeader>
            <DialogTitle>Tạo phiếu kho — kỳ {period}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <StockMutationForm key={mode} initialMode={mode} warehouses={warehouses} products={products} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
