import Link from 'next/link'
import { listTaxPlans }          from '@/features/tax-plans/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { getGlobalFilter }       from '@/lib/global-filter'
import { PageHeader }            from '@/components/shared/PageHeader'
import { EmptyState }            from '@/components/shared/EmptyState'
import { Button }                from '@/components/ui/button'
import { PAGE_WRAPPER, LIST_WRAP, LIST_THEAD, LIST_ROW } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function KeHoachThuePage() {
  const { companyId } = await getGlobalFilter()
  const me = await getCurrentUser()
  const canEdit = !!me && canApprove(me.role)

  const plans = await listTaxPlans(companyId || undefined)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Kế hoạch thuế"
        subtitle={`${plans.length} kế hoạch · mỗi công ty/dự án/năm có thể có 1 kế hoạch riêng`}
        actions={canEdit ? (
          <Link href="/ke-hoach-thue/moi">
            <Button>+ Tạo kế hoạch thuế</Button>
          </Link>
        ) : undefined}
      />

      {plans.length === 0 ? (
        <EmptyState
          icon="📑"
          title="Chưa có kế hoạch thuế nào"
          description="Tạo kế hoạch thuế đầu năm cho công ty hoặc cho từng dự án lớn. Mẫu gồm 16 chỉ tiêu (doanh thu, chi phí, lợi nhuận, thuế TNDN) — formula tự tính."
          action={canEdit ? (
            <Link href="/ke-hoach-thue/moi">
              <Button>+ Tạo kế hoạch thuế</Button>
            </Link>
          ) : undefined}
        />
      ) : (
        <div className={LIST_WRAP}>
          <table className="w-full text-sm">
            <thead className={LIST_THEAD}>
              <tr>
                <th className="px-4 py-3 text-left">Năm</th>
                <th className="px-4 py-3 text-left">Công ty</th>
                <th className="px-4 py-3 text-left">Dự án</th>
                <th className="px-4 py-3 text-center">Mẫu</th>
                <th className="px-4 py-3 text-center">Mở</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className={LIST_ROW}>
                  <td className="px-4 py-3 font-mono font-semibold text-brand-800">{p.year}</td>
                  <td className="px-4 py-3 text-gray-800">{p.company_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.project_name ?? <span className="text-gray-400 italic text-xs">Toàn công ty</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.has_template
                      ? <span className="text-xs bg-brand-50 text-brand-800 px-2 py-0.5 rounded-full">KHT v1</span>
                      : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Lines (cũ)</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/ke-hoach-thue/${p.id}`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >Mở →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
