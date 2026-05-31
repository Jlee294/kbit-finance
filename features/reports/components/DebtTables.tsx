import { createClient } from '@/lib/supabase/server'

function fmt(value: number, currency: string) {
  return new Intl.NumberFormat('vi-VN', {
    style:           'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/* ── AR (công nợ KH) ── */
interface ArRow {
  id:          string
  customer:    string | null
  order_date:  string
  outstanding: number
  currency:    string
}

interface ArProps {
  companyId:  string
  projectId?: string
  to?:        string
  currency:   string
}

export async function ArDebtTable({ companyId, projectId, to, currency }: ArProps) {
  const supabase = await createClient()
  let q = supabase
    .from('customer_orders')
    .select('id, order_date, outstanding, customers(name)')
    .eq('company_id', companyId)
    .neq('fulfillment_status', 'draft')
    .gt('outstanding', 0)
    .order('order_date', { ascending: false })
    .limit(50)

  if (projectId) q = q.eq('project_id', projectId)
  if (to)        q = q.lte('order_date', to)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<{
    id: string; order_date: string; outstanding: number
    customers: { name: string } | null
  }>

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50">
        <p className="text-sm font-medium text-gray-700">Công nợ khách hàng (phải thu)</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">Không có công nợ.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500 uppercase">
              <th className="px-5 py-2.5 text-left">Khách hàng</th>
              <th className="px-5 py-2.5 text-left">Ngày đơn</th>
              <th className="px-5 py-2.5 text-right">Còn lại</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-5 py-2 text-gray-700">{r.customers?.name ?? '—'}</td>
                <td className="px-5 py-2 text-gray-500 text-xs">
                  {new Date(r.order_date).toLocaleDateString('vi-VN')}
                </td>
                <td className="px-5 py-2 text-right font-mono text-gray-900">
                  {fmt(r.outstanding, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ── AP (công nợ NCC) ── */
interface ApProps {
  companyId:  string
  projectId?: string
  to?:        string
}

export async function ApDebtTable({ companyId, projectId, to }: ApProps) {
  const supabase = await createClient()
  let q = supabase
    .from('supplier_orders')
    .select('id, order_date, outstanding, currency, exchange_rate, suppliers(name)')
    .eq('company_id', companyId)
    .gt('outstanding', 0)
    .order('order_date', { ascending: false })
    .limit(50)

  if (projectId) q = q.eq('project_id', projectId)
  if (to)        q = q.lte('order_date', to)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<{
    id: string; order_date: string; outstanding: number
    currency: string; exchange_rate: number | null
    suppliers: { name: string } | null
  }>

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b bg-gray-50">
        <p className="text-sm font-medium text-gray-700">Công nợ nhà cung cấp (phải trả)</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400 text-center">Không có công nợ.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500 uppercase">
              <th className="px-5 py-2.5 text-left">Nhà cung cấp</th>
              <th className="px-5 py-2.5 text-left">Ngày đơn</th>
              <th className="px-5 py-2.5 text-right">Còn lại (ngtệ)</th>
              <th className="px-5 py-2.5 text-right">Tương đương VND</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const rate = r.currency === 'VND' ? 1 : (r.exchange_rate ?? 1)
              const vnd  = r.outstanding * rate
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2 text-gray-700">{r.suppliers?.name ?? '—'}</td>
                  <td className="px-5 py-2 text-gray-500 text-xs">
                    {new Date(r.order_date).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-5 py-2 text-right font-mono text-gray-700">
                    {fmt(r.outstanding, r.currency)}
                  </td>
                  <td className="px-5 py-2 text-right font-mono text-gray-900">
                    {fmt(vnd, 'VND')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
