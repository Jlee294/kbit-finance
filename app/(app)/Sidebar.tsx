'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { UserRole } from '@/lib/auth'
import {
  navGroups, isActive, filterItemsByRole, activeGroupLabel,
  resolveOpenGroups, parseSaved,
} from '@/lib/nav'
import { useT } from '@/lib/i18n/client'

const STORAGE_KEY = 'kbit:nav:openGroups'

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const t = useT()
  const activeLabel = activeGroupLabel(navGroups, pathname)

  // Khởi tạo KHÔNG đọc localStorage → server & client render đầu giống nhau (tránh hydration mismatch).
  const [open, setOpen] = useState<Set<string>>(() => resolveOpenGroups(activeLabel, null))

  // Sau mount (và mỗi khi đổi nhóm active): nạp trạng thái đã lưu + ép mở nhóm active.
  useEffect(() => {
    const saved = parseSaved(localStorage.getItem(STORAGE_KEY))
    setOpen(resolveOpenGroups(activeLabel, saved))
  }, [activeLabel])

  function toggleGroup(label: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1 overflow-y-auto">
      {navGroups.map((group) => {
        const items = filterItemsByRole(group.items, role)
        if (items.length === 0) return null
        const isOpen = open.has(group.label)

        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              className={`w-full flex items-center justify-between px-3 mt-3 mb-1 text-[11px] font-bold uppercase tracking-widest transition-colors
                ${isOpen ? 'text-brand-600' : 'text-gray-400 hover:text-brand-600'}`}
            >
              <span>{t(group.label)}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                strokeWidth={2.2}
              />
            </button>

            {isOpen && (
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href)
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors
                          ${active
                            ? 'bg-brand-50 text-brand-700 font-semibold'
                            : 'text-gray-700 hover:bg-brand-50/60 hover:text-brand-700'
                          }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand-600" />
                        )}
                        <Icon
                          className={`h-4 w-4 shrink-0 ${active ? 'text-brand-600' : 'text-gray-400 group-hover:text-brand-600'}`}
                          strokeWidth={1.75}
                        />
                        <span>{t(label)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )
}
