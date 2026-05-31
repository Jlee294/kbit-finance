import Link from 'next/link'
import { listAuditLog } from '@/features/audit/queries'
import { AuditTable } from '@/features/audit/components/AuditTable'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; by?: string; period?: string }>
}) {
  const sp = await searchParams
  const filter = {
    table:     sp.table     || undefined,
    changedBy: sp.by        || undefined,
    period:    sp.period    || undefined,
  }

  const supabase = await createClient()
  const [entries, usersResult] = await Promise.all([
    listAuditLog(filter),
    supabase.from('users').select('id, full_name').order('full_name'),
  ])
  const users = (usersResult.data ?? []) as { id: string; full_name: string }[]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/duyet-khoa-ky" className="text-sm text-gray-400 hover:text-gray-600">
          ← Duyệt & Khóa kỳ
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
      </div>
      <p className="text-sm text-gray-500">
        Lịch sử mọi thao tác INSERT / UPDATE / DELETE, ghi tự động bởi DB trigger.
        Dữ liệu chỉ đọc — không ai sửa/xóa được.
      </p>
      <AuditTable
        entries={entries}
        users={users}
        tableFilter={sp.table  ?? ''}
        byFilter={sp.by        ?? ''}
        periodFilter={sp.period ?? ''}
      />
    </div>
  )
}
