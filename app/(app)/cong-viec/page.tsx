import { listTasks }          from '@/features/tasks/queries'
import { TaskList }            from '@/features/tasks/components/TaskList'
import { createTask, generateAutoTasks } from '@/features/tasks/actions'
import { listCompanies }       from '@/features/companies/queries'
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@/features/tasks/schema'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { Button }              from '@/components/ui/button'
import { PageHeader }          from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FilterSubmit, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { PAGE_WRAPPER }        from '@/lib/ui-tokens'

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
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={
          <span>
            Công việc
            {openCount > 0 && (
              <span className="ml-2 text-sm bg-warning-50 text-warning-700 ring-1 ring-warning-500/30 px-2 py-0.5 rounded-full font-medium align-middle">
                {openCount}
              </span>
            )}
          </span>
        }
        subtitle="Công việc thủ công + tự động"
        actions={canEdit && companyId ? (
          <form action={async () => { 'use server'; await generateAutoTasks(companyId) }}>
            <Button type="submit" variant="outline" size="sm">
              Quét tạo công việc tự động
            </Button>
          </form>
        ) : undefined}
      />

      <FilterBar>
        <FilterField label="Trạng thái">
          <select name="status" defaultValue={statusFilter} className={FILTER_CONTROL}>
            <option value="">Tất cả</option>
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Công ty (quét auto-task)">
          <select name="company" defaultValue={companyId ?? ''} className={`${FILTER_CONTROL} min-w-[160px]`}>
            <option value="">— Tất cả —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
        <FilterSubmit />
      </FilterBar>

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
