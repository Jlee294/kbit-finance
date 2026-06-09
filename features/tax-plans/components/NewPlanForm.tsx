'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { upsertTaxPlan } from '../actions'
import { newEmptyTemplate } from '../template'

type CompanyOpt = { id: string; name: string }
type ProjectOpt = { id: string; code: string; name: string; company_id: string }

interface Props {
  companies: CompanyOpt[]
  projects:  ProjectOpt[]
}

const SEL = 'h-9 px-2.5 text-sm rounded-md border border-gray-300 bg-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 w-full'

export function NewPlanForm({ companies, projects }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? '')
  const [projectId, setProjectId] = useState<string>('')
  const [year, setYear] = useState<number>(new Date().getFullYear())

  const filteredProjects = companyId ? projects.filter((p) => p.company_id === companyId) : []
  const years = Array.from({ length: 6 }, (_, i) => year - 2 + i)

  function create() {
    if (!companyId) { toast.error('Chọn công ty'); return }
    start(async () => {
      try {
        await upsertTaxPlan({
          company_id: companyId,
          project_id: projectId || null,
          year,
          plan_data: newEmptyTemplate(),
        })
        toast.success('Đã tạo kế hoạch thuế')
        router.push('/ke-hoach-thue')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Lỗi')
      }
    })
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Công ty <span className="text-red-500">*</span>
          </label>
          <select className={SEL} value={companyId} onChange={(e) => { setCompanyId(e.target.value); setProjectId('') }}>
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dự án <span className="text-gray-400 font-normal">(để trống = toàn công ty)</span>
          </label>
          <select className={SEL} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Toàn công ty —</option>
            {filteredProjects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Năm</label>
          <select className={SEL} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-md bg-brand-50/40 border border-brand-100 px-4 py-3 text-xs text-brand-800 space-y-1">
        <p><strong>Mẫu KHT v1</strong> bao gồm 16 chỉ tiêu cố định:</p>
        <p className="text-gray-700">
          1. Doanh thu dự kiến → 2. Các khoản giảm trừ DT → 3. DT thuần →
          4. Giá vốn → 5. Lợi nhuận gộp → 6/7/8. Chi phí bán hàng/quản lý/tài chính →
          9. LN thuần → 10/11. DT-CP khác → 12. LN khác → 13. LN trước thuế →
          14. Thuế suất → 15. Thuế TNDN → 16. LN sau thuế
        </p>
        <p>Bạn có thể thêm chỉ tiêu con dưới mục 6, 7, 8 sau khi tạo.</p>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>Huỷ</Button>
        <Button onClick={create} disabled={pending || !companyId}>
          {pending ? 'Đang tạo…' : 'Tạo kế hoạch'}
        </Button>
      </div>
    </div>
  )
}
