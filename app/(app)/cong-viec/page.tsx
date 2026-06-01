import { listTasks }          from '@/features/tasks/queries'
import { TaskList }            from '@/features/tasks/components/TaskList'
import { createTask, generateAutoTasks } from '@/features/tasks/actions'
import { listCompanies }       from '@/features/companies/queries'
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@/features/tasks/schema'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { Button }              from '@/components/ui/button'

interface SearchParams {
  status?:  string
  company?: string
}

export const dynamic = 'force-dynamic'

export default async function CongViecPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp           = await searchParams
  const companyId    = sp.company
  const statusFilter = sp.status as any || ''

  const [companies, me] = await Promise.all([listCompanies(), getCurrentUser()])
  const canEdit = !!me && canApprove(me.role)

  const tasks = await listTasks({ status: statusFilter || undefined })

  const openCount = tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Công việc
            {openCount > 0 && (
              <span className="ml-2 text-sm bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {openCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Công việc thủ công + tự động</p>
        </div>

        {canEdit && companyId && (
          <form action={async () => { 'use server'; await generateAutoTasks(companyId) }}>
            <Button type="submit" variant="outline" size="sm">
              Quét tạo công việc tự động
            </Button>
          </form>
        )}
      </div>

      {/* Bộ lọc — form GET + nút Lọc */}
      <form method="get" className="flex flex-wrap gap-3 items-end bg-white rounded-xl border px-4 py-3 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Trạng thái</p>
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-8 rounded-md border text-sm px-2 bg-white"
          >
            <option value="">Tất cả</option>
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Công ty (quét auto-task)</p>
          <select
            name="company"
            defaultValue={companyId ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[140px]"
          >
            <option value="">— Tất cả —</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 self-end"
        >
          Lọc
        </button>
      </form>

      {/* Form tạo task thủ công */}
      <form
        action={async (fd: FormData) => {
          'use server'
          await createTask({
            title:    fd.get('title')    as string,
            due_date: fd.get('due_date') as string || undefined,
          })
        }}
        className="flex gap-3 items-end bg-white rounded-xl border px-4 py-3 shadow-sm"
      >
        <div className="flex-1 space-y-1">
          <label className="text-xs text-gray-500">Tiêu đề công việc mới</label>
          <input
            name="title"
            required
            className="w-full h-8 rounded-md border text-sm px-2"
            placeholder="Nhập tiêu đề..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Hạn (tùy chọn)</label>
          <input type="date" name="due_date" className="h-8 rounded-md border text-sm px-2" />
        </div>
        <button
          type="submit"
          className="h-8 px-3 bg-brand-800 text-white rounded-md text-sm hover:bg-brand-700"
        >
          Tạo
        </button>
      </form>

      <TaskList tasks={tasks} />
    </div>
  )
}
