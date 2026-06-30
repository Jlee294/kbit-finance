import { listTasks }          from '@/features/tasks/queries'
import { TaskList }            from '@/features/tasks/components/TaskList'
import { createTask, generateAutoTasks } from '@/features/tasks/actions'
import { listCompanies }       from '@/features/companies/queries'
import { listUsers }           from '@/features/users/queries'
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@/features/tasks/schema'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { Button }              from '@/components/ui/button'
import { PageHeader }          from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { AutoSubmit } from '@/components/shared/AutoSubmit'
import { PAGE_WRAPPER }        from '@/lib/ui-tokens'
import { getT }                from '@/lib/i18n/server'

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

  const [companies, users, me] = await Promise.all([listCompanies(), listUsers(), getCurrentUser()])
  const t = await getT()
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
        subtitle={t('Công việc thủ công + tự động')}
        actions={canEdit && companyId ? (
          <form action={async () => { 'use server'; await generateAutoTasks(companyId) }}>
            <Button type="submit" variant="outline" size="sm">
              {t('Quét tạo công việc tự động')}
            </Button>
          </form>
        ) : undefined}
      />

      <FilterBar>
        <AutoSubmit />
        <FilterField label={t('Trạng thái')}>
          <select name="status" defaultValue={statusFilter} className={FILTER_CONTROL}>
            <option value="">{t('Tất cả')}</option>
            {TASK_STATUSES.map(s => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label={t('Công ty (quét auto-task)')}>
          <select name="company" defaultValue={companyId ?? ''} className={`${FILTER_CONTROL} min-w-[160px]`}>
            <option value="">{t('— Tất cả —')}</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
      </FilterBar>

      {/* Form tạo task thủ công — KTT F2: + người phụ trách + ghi chú */}
      <form
        action={async (fd: FormData) => {
          'use server'
          await createTask({
            title:       fd.get('title')       as string,
            due_date:    fd.get('due_date')    as string || undefined,
            assigned_to: (fd.get('assigned_to') as string) || null,
            note:        (fd.get('note')        as string) || undefined,
          })
        }}
        className="bg-white rounded-xl border px-4 py-3 shadow-sm space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5 space-y-1">
            <label className="text-xs text-gray-500">{t('Tiêu đề công việc')} <span className="text-red-500">*</span></label>
            <input
              name="title"
              required
              className="w-full h-9 rounded-md border border-gray-300 text-sm px-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              
            />
          </div>
          <div className="md:col-span-3 space-y-1">
            <label className="text-xs text-gray-500">{t('Người phụ trách')}</label>
            <select
              name="assigned_to"
              defaultValue=""
              className="w-full h-9 rounded-md border border-gray-300 bg-white text-sm px-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{t('— Không gán —')}</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs text-gray-500">{t('Hạn')}</label>
            <input type="date" name="due_date" className="w-full h-9 rounded-md border border-gray-300 text-sm px-2" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="h-9 w-full md:w-auto px-4 bg-primary text-white rounded-md text-sm hover:bg-primary-700"
            >
              {t('+ Tạo công việc')}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('Ghi chú (tùy chọn)')}</label>
          <input
            name="note"
            className="w-full h-9 rounded-md border border-gray-300 text-sm px-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder={t('Mô tả thêm cho công việc...')}
          />
        </div>
      </form>

      <TaskList tasks={tasks} />
    </div>
  )
}
