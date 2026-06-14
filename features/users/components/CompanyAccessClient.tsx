'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DIALOG_MD } from '@/lib/ui-tokens'
import {
  setUserCompanies, createUserAccount, updateUserRole, setUserActive, resetUserPassword,
} from '../actions'
import { useT } from '@/lib/i18n/client'

type Company = { id: string; name: string }
type UserRow = { id: string; full_name: string; role: string; is_active: boolean; company_ids: string[] }

const SEE_ALL_ROLES = ['admin', 'ceo', 'chief_accountant']

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'admin',            label: 'Admin' },
  { value: 'ceo',              label: 'Giám đốc (CEO)' },
  { value: 'chief_accountant', label: 'Kế toán trưởng' },
  { value: 'accountant',       label: 'Kế toán' },
  { value: 'viewer',           label: 'Chỉ xem' },
]
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r.label]))

const INPUT = 'w-full h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'

export function CompanyAccessClient({ users, companies }: { users: UserRow[]; companies: Company[] }) {
  const router = useRouter()
  const t = useT()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {}
    for (const u of users) m[u.id] = new Set(u.company_ids)
    return m
  })
  const [msg, setMsg] = useState<string>('')
  const [addOpen, setAddOpen] = useState(false)

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 4000) }

  function toggle(userId: string, companyId: string) {
    setDraft((prev) => {
      const next = { ...prev }
      const s = new Set(next[userId])
      if (s.has(companyId)) s.delete(companyId); else s.add(companyId)
      next[userId] = s
      return next
    })
  }

  function saveCompanies(userId: string) {
    start(async () => {
      const res = await setUserCompanies(userId, [...draft[userId]])
      flash(res.ok ? '✓ Đã lưu phân quyền công ty' : '❌ ' + res.error)
      if (res.ok) router.refresh()
    })
  }

  function changeRole(userId: string, role: string) {
    start(async () => {
      const res = await updateUserRole(userId, role)
      flash(res.ok ? '✓ Đã đổi vai trò' : '❌ ' + res.error)
      router.refresh()
    })
  }

  function toggleActive(u: UserRow) {
    if (!confirm(u.is_active ? `Khóa tài khoản "${u.full_name}"?` : `Mở khóa "${u.full_name}"?`)) return
    start(async () => {
      const res = await setUserActive(u.id, !u.is_active)
      flash(res.ok ? '✓ Đã cập nhật' : '❌ ' + res.error)
      router.refresh()
    })
  }

  function resetPw(u: UserRow) {
    const pw = prompt(`Mật khẩu mới cho "${u.full_name}" (tối thiểu 6 ký tự):`)
    if (!pw) return
    start(async () => {
      const res = await resetUserPassword(u.id, pw)
      flash(res.ok ? '✓ Đã đặt lại mật khẩu' : '❌ ' + res.error)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {msg && (
          <span className={`text-sm ${msg.startsWith('✓') ? 'text-brand-700' : 'text-red-600'}`}>{msg}</span>
        )}
        <Button size="sm" onClick={() => setAddOpen(true)} className="ml-auto">
          {t('+ Thêm người dùng')}
        </Button>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold">
            <tr>
              <th className="px-4 py-3 text-left">{t('Người dùng')}</th>
              <th className="px-4 py-3 text-left w-44">{t('Vai trò')}</th>
              <th className="px-4 py-3 text-left">{t('Công ty được xem')}</th>
              <th className="px-4 py-3 text-right w-48"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const seesAll = SEE_ALL_ROLES.includes(u.role)
              return (
                <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.full_name}
                    {!u.is_active && <span className="ml-2 text-[10px] text-red-500">({t('đã khóa')})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      disabled={pending}
                      className="h-8 rounded-md border border-gray-300 bg-white text-xs px-2 focus:border-brand-500 focus:outline-none"
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {seesAll ? (
                      <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                        {t('Tất cả công ty')} ({t('theo vai trò')})
                      </span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {companies.map((c) => (
                          <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft[u.id]?.has(c.id) ?? false}
                              onChange={() => toggle(u.id, c.id)}
                              className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
                            />
                            <span>{c.name}</span>
                          </label>
                        ))}
                        {companies.length === 0 && <span className="text-xs text-gray-400">{t('Chưa có công ty')}</span>}
                        <Button size="sm" variant="outline" disabled={pending}
                          onClick={() => saveCompanies(u.id)} className="text-xs h-7">
                          {t('Lưu')}
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => resetPw(u)} disabled={pending}
                      className="text-xs text-brand-700 hover:underline mr-3" title={t('Đặt lại mật khẩu')}>
                      🔑 {t('Mật khẩu')}
                    </button>
                    <button onClick={() => toggleActive(u)} disabled={pending}
                      className={`text-xs hover:underline ${u.is_active ? 'text-red-600' : 'text-brand-700'}`}>
                      {u.is_active ? t('Khóa') : t('Mở khóa')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AddUserDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        companies={companies}
        oncreated={() => { setAddOpen(false); flash('✓ Đã tạo người dùng'); router.refresh() }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
function AddUserDialog({ open, onClose, companies, oncreated }: {
  open: boolean
  onClose: () => void
  companies: Company[]
  oncreated: () => void
}) {
  const t = useT()
  const [pending, start] = useTransition()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('accountant')
  const [companyIds, setCompanyIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  const seesAll = SEE_ALL_ROLES.includes(role)

  function reset() {
    setFullName(''); setEmail(''); setPassword(''); setRole('accountant')
    setCompanyIds(new Set()); setError('')
  }

  function submit() {
    setError('')
    start(async () => {
      const res = await createUserAccount({
        email, password, full_name: fullName, role,
        companyIds: seesAll ? [] : [...companyIds],
      })
      if (!res.ok) { setError(res.error); return }
      reset()
      oncreated()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose() } }}>
      <DialogContent showCloseButton className={DIALOG_MD}>
        <DialogHeader>
          <DialogTitle>{t('Thêm người dùng mới')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Họ tên')} <span className="text-red-500">*</span></label>
              <input className={INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Vai trò')} <span className="text-red-500">*</span></label>
              <select className={INPUT} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <input type="email" className={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@kbit.vn" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Mật khẩu')} <span className="text-red-500">*</span></label>
              <input type="text" className={INPUT} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Tối thiểu 6 ký tự')} />
            </div>
          </div>

          {!seesAll && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('Công ty được xem')}</label>
              <div className="flex flex-wrap gap-3 rounded-md border border-gray-200 bg-gray-50 p-2">
                {companies.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={companyIds.has(c.id)}
                      onChange={() => setCompanyIds((prev) => {
                        const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s
                      })}
                      className="rounded border-gray-300 text-brand-700 focus:ring-brand-500" />
                    <span>{c.name}</span>
                  </label>
                ))}
                {companies.length === 0 && <span className="text-xs text-gray-400">{t('Chưa có công ty')}</span>}
              </div>
            </div>
          )}
          {seesAll && (
            <p className="text-xs text-brand-700 bg-brand-50 rounded-md px-3 py-2">
              {t('Vai trò này thấy tất cả công ty — không cần gán.')}
            </p>
          )}

          {error && (
            <div className="rounded-md bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { reset(); onClose() }} disabled={pending}>{t('Hủy')}</Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? t('Đang tạo…') : t('Tạo người dùng')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
