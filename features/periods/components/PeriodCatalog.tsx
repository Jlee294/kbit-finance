'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { PeriodForm } from './PeriodForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { lockPeriod, unlockPeriod } from '../actions'

type Period = { id: string; period: string; status: string; locked_at: string | null; companies: { code: string } | null; users: { full_name: string } | null }

export function PeriodCatalog({ rows, canWrite }: { rows: Period[]; canWrite: boolean }) {
  return (
    <CatalogPage
      title="Kỳ kế toán"
      subtitle="Quản lý kỳ kế toán theo tháng (mỗi công ty). Khóa kỳ để CHẶN thêm/sửa mọi giao dịch có ngày thuộc kỳ đó — bảo vệ số liệu đã chốt khỏi bị thay đổi."
      rows={rows}
      canWrite={canWrite}
      FormComponent={PeriodForm}
      dialogSize="sm"
      columns={[
        { key: 'period', label: 'Kỳ' },
        { key: 'companies', label: 'Công ty', render: (r) => r.companies?.code ?? '' },
        { key: 'status', label: 'Trạng thái', render: (r) => (
          <Badge variant={r.status === 'locked' ? 'destructive' : 'default'}>
            {r.status === 'locked' ? 'Đã khóa' : 'Mở'}
          </Badge>
        )},
        { key: 'locked_at', label: 'Thời điểm khóa', render: (r) => r.locked_at ? new Date(r.locked_at).toLocaleString('vi-VN') : '' },
        ...(canWrite ? [{
          key: 'actions' as const,
          label: '',
          render: (r: Period) => r.status === 'locked' ? (
            <form action={unlockPeriod.bind(null, r.id)}>
              <Button variant="outline" size="sm" type="submit">Mở khóa</Button>
            </form>
          ) : (
            <form action={lockPeriod.bind(null, r.id)}>
              <Button variant="destructive" size="sm" type="submit">Khóa kỳ</Button>
            </form>
          )
        }] : []),
      ]}
    />
  )
}
