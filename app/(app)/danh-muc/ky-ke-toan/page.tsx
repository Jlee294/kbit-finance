import { listPeriods } from '@/features/periods/queries'
import { lockPeriod, unlockPeriod } from '@/features/periods/actions'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { PeriodForm } from '@/features/periods/components/PeriodForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function PeriodPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listPeriods()])
  const write = me ? canApprove(me.role) : false

  return (
    <CatalogPage
      title="Kỳ kế toán"
      rows={rows}
      canWrite={write}
      FormComponent={PeriodForm}
      columns={[
        { key: 'period', label: 'Kỳ' },
        { key: 'companies', label: 'Công ty', render: (r) => (r.companies as { code: string } | null)?.code ?? '' },
        {
          key: 'status', label: 'Trạng thái', render: (r) => (
            <Badge variant={r.status === 'locked' ? 'destructive' : 'default'}>
              {r.status === 'locked' ? 'Đã khóa' : 'Mở'}
            </Badge>
          )
        },
        {
          key: 'locked_by', label: 'Người khóa',
          render: (r) => (r.users as { full_name: string } | null)?.full_name ?? ''
        },
        {
          key: 'locked_at', label: 'Thời điểm khóa',
          render: (r) => r.locked_at ? new Date(r.locked_at).toLocaleString('vi-VN') : ''
        },
        write ? {
          key: 'actions', label: '',
          render: (r) => r.status === 'locked' ? (
            <form action={unlockPeriod.bind(null, r.id)}>
              <Button variant="outline" size="sm" type="submit">Mở khóa</Button>
            </form>
          ) : (
            <form action={lockPeriod.bind(null, r.id)}>
              <Button variant="destructive" size="sm" type="submit">Khóa kỳ</Button>
            </form>
          )
        } : { key: 'actions', label: '', render: () => null }
      ]}
    />
  )
}
