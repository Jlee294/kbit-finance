'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setUserCompanies } from '../actions'
import { useT } from '@/lib/i18n/client'

type Company = { id: string; name: string }
type UserRow = { id: string; full_name: string; role: string; is_active: boolean; company_ids: string[] }

const SEE_ALL_ROLES = ['admin', 'ceo', 'chief_accountant']

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', ceo: 'Giám đốc', chief_accountant: 'Kế toán trưởng',
  accountant: 'Kế toán', viewer: 'Chỉ xem',
}

export function CompanyAccessClient({ users, companies }: { users: UserRow[]; companies: Company[] }) {
  const router = useRouter()
  const t = useT()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {}
    for (const u of users) m[u.id] = new Set(u.company_ids)
    return m
  })
  const [savedMsg, setSavedMsg] = useState<string>('')

  function toggle(userId: string, companyId: string) {
    setDraft((prev) => {
      const next = { ...prev }
      const s = new Set(next[userId])
      if (s.has(companyId)) s.delete(companyId)
      else s.add(companyId)
      next[userId] = s
      return next
    })
  }

  function save(userId: string) {
    setSavedMsg('')
    start(async () => {
      const res = await setUserCompanies(userId, [...draft[userId]])
      if (!res.ok) { setSavedMsg('❌ ' + res.error); return }
      setSavedMsg('✓ Đã lưu phân quyền')
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold">
          <tr>
            <th className="px-4 py-3 text-left">{t('Người dùng')}</th>
            <th className="px-4 py-3 text-left">{t('Vai trò')}</th>
            <th className="px-4 py-3 text-left">{t('Công ty được xem')}</th>
            <th className="px-4 py-3 text-right"></th>
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
                <td className="px-4 py-3 text-gray-600 text-xs">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-4 py-3">
                  {seesAll ? (
                    <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                      {t('Tất cả công ty')} ({t('theo vai trò')})
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!seesAll && (
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => save(u.id)} className="text-xs">
                      {t('Lưu')}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {savedMsg && (
        <p className={`px-4 py-2 text-xs ${savedMsg.startsWith('✓') ? 'text-brand-700' : 'text-red-600'}`}>{savedMsg}</p>
      )}
    </div>
  )
}
