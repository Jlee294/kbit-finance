'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND } from '@/lib/format'
import { createIncomeWithAllocations, fetchOrdersForAlloc } from '../actions'
import { AllocationRows, newAllocRow, type AllocRow, type OrderForAlloc } from './AllocationRows'

type SimpleOption   = { id: string; name: string }
type CustomerOption = { id: string; code: string; name: string }
type BankOption     = { id: string; name: string; currency: string; company_id: string }
type ProjectOption  = { id: string; code: string; name: string; company_id: string }

interface Props {
  companies: SimpleOption[]
  customers: CustomerOption[]
  bankAccounts: BankOption[]
  projects: ProjectOption[]
  onDone: () => void
}

export function IncomeForm({ companies, customers, bankAccounts, projects, onDone }: Props) {
  const router = useRouter()

  const [companyId,    setCompanyId]    = useState('')
  const [customerId,   setCustomerId]   = useState('')
  const [bankId,       setBankId]       = useState('')
  const [projectId,    setProjectId]    = useState('')
  const [amount,       setAmount]       = useState('')
  const [txnDate,      setTxnDate]      = useState(new Date().toISOString().slice(0, 10))
  const [note,         setNote]         = useState('')
  const [allocRows,    setAllocRows]    = useState<AllocRow[]>([])
  const [orders,       setOrders]       = useState<OrderForAlloc[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

  // Filtered lists by company
  const filteredBanks    = companyId ? bankAccounts.filter((b) => b.company_id === companyId) : bankAccounts
  const filteredProjects = companyId ? projects.filter((p) => p.company_id === companyId)    : projects

  async function handleCustomerChange(cid: string) {
    setCustomerId(cid)
    setAllocRows([])
    setOrders([])
    if (!cid || !companyId) return
    setLoadingOrders(true)
    try {
      const list = await fetchOrdersForAlloc(companyId, cid)
      setOrders(list.map((o) => ({
        id: o.id,
        order_code: o.order_code,
        grand_total: Number(o.grand_total),
        outstanding: Number(o.outstanding),
      })))
    } catch {
      // ignore — just show empty
    } finally {
      setLoadingOrders(false)
    }
  }

  async function handleCompanyChange(cid: string) {
    setCompanyId(cid)
    setBankId('')
    setProjectId('')
    setCustomerId('')
    setOrders([])
    setAllocRows([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const totalAlloc = allocRows.reduce((s, r) => s + (parseFloat(r.allocated_amount) || 0), 0)
      const amt = parseFloat(amount) || 0

      if (totalAlloc > amt) {
        setError('Tổng phân bổ vượt quá số tiền phiếu thu')
        return
      }

      await createIncomeWithAllocations({
        company_id:      companyId,
        bank_account_id: bankId,
        customer_id:     customerId,
        amount:          amt,
        txn_date:        txnDate,
        note:            note || null,
        project_id:      projectId || null,
        allocations:     allocRows
          .filter((r) => r.order_id && parseFloat(r.allocated_amount) > 0)
          .map((r) => ({
            customer_order_id: r.order_id,
            allocated_amount:  parseFloat(r.allocated_amount),
          })),
      })

      router.refresh()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  const totalAlloc = allocRows.reduce((s, r) => s + (parseFloat(r.allocated_amount) || 0), 0)
  const amt = parseFloat(amount) || 0

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ─ Header fields ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        <div className="space-y-1">
          <Label>Công ty <span className="text-red-500">*</span></Label>
          <select value={companyId} onChange={(e) => handleCompanyChange(e.target.value)}
            required className={sel}>
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Khách hàng <span className="text-red-500">*</span></Label>
          <select value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}
            required className={sel}>
            <option value="">— Chọn khách hàng —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Tài khoản nhận tiền <span className="text-red-500">*</span></Label>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)}
            required className={sel}>
            <option value="">— Chọn tài khoản —</option>
            {filteredBanks.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Dự án</Label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
            <option value="">— Không có —</option>
            {filteredProjects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Số tiền thu <span className="text-red-500">*</span></Label>
          <Input
            type="number" min="1" step="1000"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="VD: 50000000"
            required
          />
          {amt > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">{formatVND(amt)}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Ngày thu <span className="text-red-500">*</span></Label>
          <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
        </div>

        <div className="space-y-1 col-span-2">
          <Label>Ghi chú</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Thu đơn FEMI-0526-01..." />
        </div>
      </div>

      {/* ─ Allocation rows ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">Phân bổ vào đơn hàng</Label>
          {loadingOrders && (
            <span className="text-xs text-gray-400">Đang tải đơn...</span>
          )}
        </div>

        {!customerId ? (
          <p className="text-sm text-gray-400 italic">Chọn khách hàng để xem đơn còn nợ</p>
        ) : (
          <AllocationRows
            rows={allocRows}
            orders={orders}
            totalAmount={amt}
            onChange={setAllocRows}
          />
        )}

        {amt > 0 && totalAlloc === 0 && (
          <p className="mt-2 text-sm text-amber-600">
            ⚠ Không phân bổ đơn nào → phiếu thu sẽ được đánh dấu là <strong>tiền cọc</strong>
          </p>
        )}
        {amt > 0 && totalAlloc > 0 && totalAlloc < amt && (
          <p className="mt-2 text-sm text-amber-600">
            ⚠ Còn {formatVND(amt - totalAlloc)} chưa phân bổ → sẽ vào <strong>số dư trả trước</strong> của khách
          </p>
        )}
      </div>

      {/* ─ Error / actions ─────────────────────────────────────────── */}
      {error && (
        <p className="rounded-md bg-danger-50 px-4 py-2 text-sm text-danger-700">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Ghi phiếu thu'}
        </Button>
      </div>
    </form>
  )
}
