'use client'

import { useTransition }  from 'react'
import { toast }          from 'sonner'
import { updateTaskStatus } from '../actions'
import { TASK_STATUS_LABELS, type TaskStatus } from '../schema'
import type { TaskRow }   from '../queries'

const STATUS_CLS: Record<TaskStatus, string> = {
  open:        'bg-gray-100 text-gray-700',
  in_progress: 'bg-brand-50  text-brand-800',
  done:        'bg-green-50 text-green-700',
  overdue:     'bg-red-50   text-red-700',
}

const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  open:        'in_progress',
  in_progress: 'done',
}

interface Props {
  tasks: TaskRow[]
}

function TaskRow({ task }: { task: TaskRow }) {
  const [pending, startTransition] = useTransition()
  const next = NEXT_STATUS[task.status]

  function advance() {
    if (!next) return
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, next)
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Lỗi')
      }
    })
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2.5 text-gray-700 text-sm">
        {task.title}
        {task.auto_generated && (
          <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">tự động</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-500 text-xs">
        {task.due_date ? new Date(task.due_date).toLocaleDateString('vi-VN') : '—'}
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{task.assignee_name ?? '—'}</td>
      <td className="px-4 py-2.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[task.status]}`}>
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right">
        {next && (
          <button
            onClick={advance}
            disabled={pending}
            className="text-xs text-brand-700 hover:underline disabled:opacity-40"
          >
            {TASK_STATUS_LABELS[next]} →
          </button>
        )}
      </td>
    </tr>
  )
}

export function TaskList({ tasks }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm px-6 py-8 text-center text-sm text-gray-400">
        Không có công việc nào.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 text-left">Tiêu đề</th>
            <th className="px-4 py-3 text-left">Hạn</th>
            <th className="px-4 py-3 text-left">Người phụ trách</th>
            <th className="px-4 py-3 text-left">Trạng thái</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map(t => <TaskRow key={t.id} task={t} />)}
        </tbody>
      </table>
    </div>
  )
}
