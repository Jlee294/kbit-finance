import { Suspense } from 'react'
import { getGlobalFilter } from '@/lib/global-filter'
import { resolveRange } from '@/lib/date-range'
import { getDashboardData } from '@/features/reports/dashboard'
import { createClient } from '@/lib/supabase/server'
import { DashboardClient } from './DashboardClient'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FilterReset, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { PeriodFields } from '@/components/shared/PeriodFields'
import { AutoSubmit } from '@/components/shared/AutoSubmit'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import { isDemoMode } from '@/lib/demo'

export const dynamic = 'force-dynamic'

interface SearchParams { project?: string; period?: string; from?: string; to?: string }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getT()
  const sp = await searchParams
  const { companyId, year } = await getGlobalFilter()

  // Dự án cho bộ lọc (theo công ty đang chọn nếu có)
  let projects: Array<{ id: string; name: string }>
  if (isDemoMode()) {
    projects = []
  } else {
    const supabase = await createClient()
    let pq = supabase.from('projects').select('id, name').order('name')
    if (companyId) pq = pq.eq('company_id', companyId)
    projects = (await pq).data ?? []
  }
  const projectName = sp.project ? projects.find(p => p.id === sp.project)?.name : undefined

  const range = resolveRange(year, sp.period, sp.from, sp.to)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Dashboard điều hành')}
        subtitle={`${t('Tổng quan tài chính theo công ty · dự án · thời gian')} — ${range.from} → ${range.to}`}
        actions={
          <Link href="/bao-cao" className="text-sm text-brand-700 hover:underline font-medium">
            Báo cáo chi tiết →
          </Link>
        }
      />

      <FilterBar>
        <AutoSubmit />
        <FilterField label={t('Dự án')} hint="Chọn để xem riêng 1 dự án">
          <select name="project" defaultValue={sp.project ?? ''} className={`${FILTER_CONTROL} min-w-[180px]`}>
            <option value="">{t('Tất cả dự án')}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FilterField>
        <PeriodFields period={sp.period} from={sp.from} to={sp.to} />
        <FilterReset href="/dashboard" />
      </FilterBar>

      {isDemoMode() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bộ GLA đã nhập đủ 48 dòng SPNH Techcombank: 28 dòng tự nối vào công nợ 131/331,
          20 dòng còn lại chỉ ghi nhận dòng tiền. Chưa có file sổ quỹ tiền mặt nên phần tiền mặt chưa phát sinh.
        </div>
      )}

      <Suspense fallback={<div className="h-96 rounded-xl bg-gray-50 animate-pulse" />}>
        <ContentWithName companyId={companyId} year={year} sp={sp} projectName={projectName} />
      </Suspense>
    </div>
  )
}

async function ContentWithName({ companyId, year, sp, projectName }: {
  companyId: string | null; year: string; sp: SearchParams; projectName?: string
}) {
  const range = resolveRange(year, sp.period, sp.from, sp.to)
  const data = await getDashboardData({
    year, companyId, projectId: sp.project, from: range.from, to: range.to,
  })
  return <DashboardClient data={data} projectName={projectName} />
}
