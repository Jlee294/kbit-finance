'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IncomeForm } from '@/features/payments/components/IncomeForm'
import { ExpenseVnForm } from '@/features/expenses-vn/components/ExpenseVnForm'
import { KrExpenseForm } from '@/features/expenses-kr/components/KrExpenseForm'
import { DIALOG_MD } from '@/lib/ui-tokens'

type SimpleOption    = { id: string; name: string }
type CustomerOption  = { id: string; code: string; name: string }
type SupplierOption  = { id: string; code: string; name: string }
type BankOption      = { id: string; name: string; currency: string; company_id: string }
type KrBankOption    = { id: string; name: string; company_id: string }
type ProjectOption   = { id: string; code: string; name: string; company_id: string }
type SupplierOrderOption = { id: string; order_code: string; supplier_id: string; outstanding: number }

interface Props {
  companies:    SimpleOption[]
  customers:    CustomerOption[]
  suppliers:    SupplierOption[]
  krSuppliers:  SupplierOption[]
  bankAccounts: BankOption[]
  krwBanks:     KrBankOption[]
  projects:     ProjectOption[]
  supplierOrders: SupplierOrderOption[]
}

type DialogMode = 'none' | 'thu' | 'chi-vn' | 'chi-kr'

export function BankCreateButtons({
  companies, customers, suppliers, krSuppliers,
  bankAccounts, krwBanks, projects, supplierOrders,
}: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<DialogMode>('none')

  function close() { setMode('none'); router.refresh() }

  return (
    <>
      <div className="flex gap-2">
        <a href="/ngan-hang/import-xml"
          className="h-8 px-3 inline-flex items-center text-sm rounded-md border border-input bg-white hover:bg-gray-50">
          ↥ Import sao kê
        </a>
        <Button size="sm" onClick={() => setMode('thu')}
          className="bg-brand-700 hover:bg-brand-700">
          + Thu tiền
        </Button>
        <Button size="sm" onClick={() => setMode('chi-vn')}
          className="bg-red-500 hover:bg-red-600">
          + Chi VN
        </Button>
        <Button size="sm" onClick={() => setMode('chi-kr')}
          className="bg-red-600 hover:bg-red-700">
          + Chi KR
        </Button>
      </div>

      {/* Thu tiền */}
      <Dialog open={mode === 'thu'} onOpenChange={(o) => { if (!o) setMode('none') }}>
        <DialogContent className={DIALOG_MD} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Tạo phiếu thu tiền</DialogTitle>
          </DialogHeader>
          <IncomeForm
            companies={companies}
            customers={customers}
            bankAccounts={bankAccounts}
            projects={projects}
            onDone={close}
          />
        </DialogContent>
      </Dialog>

      {/* Chi VN */}
      <Dialog open={mode === 'chi-vn'} onOpenChange={(o) => { if (!o) setMode('none') }}>
        <DialogContent className={DIALOG_MD} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Tạo phiếu chi VN (VNĐ)</DialogTitle>
          </DialogHeader>
          <ExpenseVnForm
            companies={companies}
            bankAccounts={bankAccounts.filter((b) => b.currency === 'VND')}
            projects={projects}
            suppliers={suppliers}
            supplierOrders={supplierOrders}
            onDone={close}
          />
        </DialogContent>
      </Dialog>

      {/* Chi KR */}
      <Dialog open={mode === 'chi-kr'} onOpenChange={(o) => { if (!o) setMode('none') }}>
        <DialogContent className={DIALOG_MD} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Tạo phiếu chi KR (KRW)</DialogTitle>
          </DialogHeader>
          <KrExpenseForm
            companies={companies}
            krwBanks={krwBanks}
            krSuppliers={krSuppliers}
            projects={projects}
            onDone={close}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
