import { deleteCalendarItem } from '../actions'
import type { CalendarItem }    from '../queries'
import { Button }                from '@/components/ui/button'
import { todayLocal, formatLocalDate } from '@/lib/format'
import { FiledDateCell }         from './FiledDateCell'

function statusBadge(item: CalendarItem) {
  const today = todayLocal()
  if (item.status === 'filed') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">Đã nộp</span>
  }
  if (item.due_date < today) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Quá hạn</span>
  }
  const soon = formatLocalDate(new Date(Date.now() + 7 * 86_400_000))
  if (item.due_date <= soon) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Đến hạn ≤7 ngày</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Chờ nộp</span>
}

interface Props {
  items:   CalendarItem[]
  canEdit: boolean
  taxTypeLabels?: Record<string, string>
}

export function TaxCalendarTable({ items, canEdit, taxTypeLabels = {} }: Props) {
  if (items.length === 0) {
    return <p className="px-5 py-6 text-sm text-gray-400 text-center">Chưa có nghĩa vụ thuế nào.</p>
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 text-left">Loại thuế</th>
            <th className="px-4 py-3 text-left">Kỳ</th>
            <th className="px-4 py-3 text-left">Hạn nộp</th>
            <th className="px-4 py-3 text-center">Trạng thái</th>
            <th className="px-4 py-3 text-left">Ngày nộp</th>
            <th className="px-4 py-3 text-left">Ghi chú</th>
            {canEdit && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 text-gray-700 text-xs font-medium">
                {taxTypeLabels[item.tax_type] ?? item.tax_type}
              </td>
              <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{item.period}</td>
              <td className="px-4 py-2.5 text-gray-700 text-xs">
                {new Date(item.due_date).toLocaleDateString('vi-VN')}
              </td>
              <td className="px-4 py-2.5 text-center">{statusBadge(item)}</td>
              <td className="px-4 py-2.5">
                <FiledDateCell
                  id={item.id}
                  status={item.status}
                  due_date={item.due_date}
                  filed_date={item.filed_date}
                  canEdit={canEdit}
                />
              </td>
              <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[140px] truncate">
                {item.note ?? '—'}
              </td>
              {canEdit && (
                <td className="px-4 py-2.5 text-right">
                  <form action={deleteCalendarItem.bind(null, item.id)}>
                    <Button size="sm" variant="ghost" type="submit" className="text-xs text-red-500">
                      Xóa
                    </Button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
