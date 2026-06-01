'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createCashEntry, updateCashEntry, deleteCashEntry } from '../actions'
import type { CashRow } from '../queries'

type SimpleOption = { id: string; name: string }
type UserOption   = { id: string; name: string }

interface Props {
  rows:      CashRow[]
  companies: SimpleOption[]
  users:     UserOption[]
  canWrite:  boolean
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + ' đ' }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('vi-VN') }

export function CashBookTable({ rows, companies, users, canWrite }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CashRow | undefined>()

  function openCreate() { setEditing(undefined); setOpen(true) }
  function openEdit(r: CashRow) { setEditing(r); setOpen(true) }
  async function handleDelete(id: string) {
    if (!confirm('Xoá chứng từ này?')) return
    const r = await deleteCashEntry(id); if (r.error) return alert(r.error); router.refresh()
  }

  // Totals
  const totalThu = rows.filter(r => r.direction === 'thu').reduce((s, r) => s + r.so_tien, 0)
  const totalChi = rows.filter(r => r.direction === 'chi').reduce((s, r) => s + r.so_tien, 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Tổng thu</p>
          <p className="text-base font-semibold text-green-700">{fmtVND(totalThu)}</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Tổng chi</p>
          <p className="text-base font-semibold text-red-600">{fmtVND(totalChi)}</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Chênh lệch</p>
          <p className={`text-base font-semibold ${totalThu - totalChi >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {fmtVND(totalThu - totalChi)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{rows.length} chứng từ</p>
        {canWrite && <Button size="sm" onClick={openCreate}>+ Thêm chứng từ</Button>}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Chưa có chứng từ nào.</div>
        ) : (
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left w-[8%]">Ký hiệu</th>
                <th className="px-3 py-2.5 text-left w-[8%]">Ngày</th>
                <th className="px-3 py-2.5 text-left w-[14%]">Đối tác</th>
                <th className="px-3 py-2.5 text-left w-[24%]">Nội dung</th>
                <th className="px-3 py-2.5 text-right w-[12%]">Số tiền</th>
                <th className="px-3 py-2.5 text-center w-[6%]">Loại</th>
                <th className="px-3 py-2.5 text-left w-[10%]">Nợ / Có</th>
                <th className="px-3 py-2.5 text-left w-[10%]">Công ty</th>
                {canWrite && <th className="px-3 py-2.5 w-[8%]"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.ky_hieu ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDate(r.txn_date)}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {r.doi_tac ?? '—'}
                    {r.ma_doi_tac && <span className="text-[10px] text-gray-400 ml-1">[{r.ma_doi_tac}]</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-800">{r.noi_dung}</td>
                  <td className={`px-3 py-2 text-right font-medium ${r.direction === 'thu' ? 'text-green-700' : 'text-red-600'}`}>
                    {r.direction === 'thu' ? '+' : '−'} {fmtVND(r.so_tien)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      r.direction === 'thu' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {r.direction === 'thu' ? 'Thu' : 'Chi'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {r.dinh_khoan_no || '—'} / {r.dinh_khoan_co || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.company_name ?? '—'}</td>
                  {canWrite && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => openEdit(r)} className="text-xs text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 mr-2">Sửa</button>
                      <button onClick={() => handleDelete(r.id)} className="text-xs text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100">Xoá</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Cập nhật' : 'Thêm'} chứng từ khác</DialogTitle>
          </DialogHeader>
          <CashForm
            initial={editing}
            companies={companies}
            users={users}
            onDone={() => { setOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Inline form ─────────────────────────────────────────────────────────────

function CashForm({ initial, companies, users, onDone }: {
  initial?: CashRow
  companies: SimpleOption[]
  users: UserOption[]
  onDone: () => void
}) {
  const [companyId,  setCompanyId]  = useState(initial?.company_id ?? companies[0]?.id ?? '')
  const [kyHieu,     setKyHieu]     = useState(initial?.ky_hieu ?? '')
  const [date,       setDate]       = useState(initial?.txn_date ?? new Date().toISOString().slice(0,10))
  const [doiTac,     setDoiTac]     = useState(initial?.doi_tac ?? '')
  const [maDoiTac,   setMaDoiTac]   = useState(initial?.ma_doi_tac ?? '')
  const [noiDung,    setNoiDung]    = useState(initial?.noi_dung ?? '')
  const [soTien,     setSoTien]     = useState(initial ? String(initial.so_tien) : '')
  const [direction,  setDirection]  = useState<'thu'|'chi'>(initial?.direction ?? 'chi')
  const [ghiChu,     setGhiChu]     = useState(initial?.ghi_chu ?? '')
  const [no,         setNo]         = useState(initial?.dinh_khoan_no ?? '')
  const [co,         setCo]         = useState(initial?.dinh_khoan_co ?? '')
  const [nhanSuId,   setNhanSuId]   = useState(initial?.nhan_su_thuc_hien ?? '')
  const [isChiHo,    setIsChiHo]    = useState(initial?.is_chi_ho ?? false)
  const [chiHoPerson, setChiHoPerson] = useState(initial?.chi_ho_person ?? '')
  const [isThuHo,    setIsThuHo]    = useState(initial?.is_thu_ho ?? false)
  const [thuHoPerson, setThuHoPerson] = useState(initial?.thu_ho_person ?? '')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      company_id: companyId, ky_hieu: kyHieu || null, txn_date: date,
      doi_tac: doiTac || null, ma_doi_tac: maDoiTac || null,
      noi_dung: noiDung, so_tien: parseFloat(soTien) || 0,
      direction, ghi_chu: ghiChu || null,
      dinh_khoan_no: no || null, dinh_khoan_co: co || null,
      nhan_su_thuc_hien: nhanSuId || null,
      is_chi_ho: isChiHo, chi_ho_person: isChiHo ? (chiHoPerson || null) : null,
      is_thu_ho: isThuHo, thu_ho_person: isThuHo ? (thuHoPerson || null) : null,
    }
    const r = initial?.id
      ? await updateCashEntry(initial.id, payload)
      : await createCashEntry(payload)
    if (r.error) { setError(r.error); setSaving(false); return }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Công ty <span className="text-red-500">*</span></Label>
          <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">—</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Loại <span className="text-red-500">*</span></Label>
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'thu'|'chi')}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="chi">Chi</option>
            <option value="thu">Thu</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Ký hiệu</Label>
          <Input value={kyHieu} onChange={(e) => setKyHieu(e.target.value)} placeholder="PT01 / PC02..." />
        </div>
        <div className="space-y-1">
          <Label>Ngày <span className="text-red-500">*</span></Label>
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Tên người rút-nộp tiền</Label>
          <Input value={doiTac} onChange={(e) => setDoiTac(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Mã đối tác</Label>
          <Input value={maDoiTac} onChange={(e) => setMaDoiTac(e.target.value)} placeholder="VD: KH001" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Nội dung <span className="text-red-500">*</span></Label>
        <Input required value={noiDung} onChange={(e) => setNoiDung(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1 col-span-1">
          <Label>Số tiền <span className="text-red-500">*</span></Label>
          <Input required type="number" min="0" step="any" value={soTien} onChange={(e) => setSoTien(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Định khoản Nợ</Label>
          <Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="111 / 112..." />
        </div>
        <div className="space-y-1">
          <Label>Định khoản Có</Label>
          <Input value={co} onChange={(e) => setCo(e.target.value)} placeholder="511 / 131..." />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nhân sự thực hiện</Label>
          <select value={nhanSuId} onChange={(e) => setNhanSuId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">— Không chọn —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Ghi chú</Label>
          <Input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
        </div>
      </div>

      {/* Thu hộ / Chi hộ */}
      <div className="rounded-lg border bg-amber-50 px-3 py-2 space-y-2">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isChiHo}
              onChange={(e) => { setIsChiHo(e.target.checked); if (!e.target.checked) setChiHoPerson('') }}
              className="h-4 w-4" />
            <span>Chi hộ</span>
          </label>
          {isChiHo && (
            <Input value={chiHoPerson} onChange={(e) => setChiHoPerson(e.target.value)}
              placeholder="Tên người được chi hộ" className="h-8 text-sm flex-1 min-w-[200px]" required={isChiHo} />
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isThuHo}
              onChange={(e) => { setIsThuHo(e.target.checked); if (!e.target.checked) setThuHoPerson('') }}
              className="h-4 w-4" />
            <span>Thu hộ</span>
          </label>
          {isThuHo && (
            <Input value={thuHoPerson} onChange={(e) => setThuHoPerson(e.target.value)}
              placeholder="Tên người được thu hộ" className="h-8 text-sm flex-1 min-w-[200px]" required={isThuHo} />
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
