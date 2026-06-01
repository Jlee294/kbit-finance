import Link from 'next/link'
import { listBankLedger, listBankAccounts } from '@/features/bank/queries'
import { listCompanies } from '@/features/companies/queries'
import { BankLedgerTable } from '@/features/bank/components/BankLedgerTable'

export const dynamic = 'force-dynamic'

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + ' đ' }

export default async function NganHangPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; bank?: string; type?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const [rows, companies, banks] = await Promise.all([
    listBankLedger({
      companyId:     sp.company || undefined,
      bankAccountId: sp.bank    || undefined,
      direction:     sp.type    || undefined,
      from:          sp.from    || undefined,
      to:            sp.to      || undefined,
      limit:         500,
    }),
    listCompanies(),
    listBankAccounts(),
  ])

  const totalThu = rows.filter(r => r.direction === 'thu').reduce((s, r) => s + r.amount_vnd, 0)
  const totalChi = rows.filter(r => r.direction === 'chi').reduce((s, r) => s + r.amount_vnd, 0)

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Ngân hàng</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {rows.length} giao dịch · gộp tất cả thu / chi VN / chi KR
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/thu-tien" className="h-8 px-3 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 flex items-center">
            + Thu tiền
          </Link>
          <Link href="/chi-vn" className="h-8 px-3 bg-red-500 text-white rounded-md text-sm hover:bg-red-600 flex items-center">
            + Chi VN
          </Link>
          <Link href="/chi-kr" className="h-8 px-3 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 flex items-center">
            + Chi KR
          </Link>
        </div>
      </div>

      {/* Tổng kết */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Tổng thu (quy VND)</p>
          <p className="text-lg font-semibold text-green-700">{fmtVND(totalThu)}</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Tổng chi (quy VND)</p>
          <p className="text-lg font-semibold text-red-600">{fmtVND(totalChi)}</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Dòng tiền ròng</p>
          <p className={`text-lg font-semibold ${totalThu - totalChi >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {fmtVND(totalThu - totalChi)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm items-end">
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Công ty</p>
          <select name="company" defaultValue={sp.company ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[120px]">
            <option value="">Tất cả</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Tài khoản NH</p>
          <select name="bank" defaultValue={sp.bank ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[180px]">
            <option value="">Tất cả</option>
            {banks.map(b => (
              <option key={b.id} value={b.id}>{b.account_name} — {b.bank_name} ({b.currency})</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Loại</p>
          <select name="type" defaultValue={sp.type ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white">
            <option value="">Tất cả</option>
            <option value="thu">Thu</option>
            <option value="chi">Chi</option>
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Từ ngày</p>
          <input type="date" name="from" defaultValue={sp.from ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Đến ngày</p>
          <input type="date" name="to" defaultValue={sp.to ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white" />
        </div>
        <button type="submit" className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">
          Lọc
        </button>
      </form>

      <BankLedgerTable rows={rows} />
    </div>
  )
}
