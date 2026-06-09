import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TaxPlanTemplateForm } from '@/features/tax-plans/components/TaxPlanTemplateForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function TaxPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const me = await getCurrentUser()
  if (!me || !canApprove(me.role)) redirect('/ke-hoach-thue')

  const supabase = await createClient()
  const { data: plan, error } = await supabase
    .from('tax_plans')
    .select(`
      id, company_id, project_id, year, plan_data,
      companies!company_id ( name ),
      projects!project_id ( name )
    `)
    .eq('id', id)
    .single()

  if (error || !plan) redirect('/ke-hoach-thue')

  const pd = plan.plan_data as any
  const isTemplate = pd?.template === 'kht_v1'
  const initialRows = isTemplate ? pd.rows : null
  const initialMeta = isTemplate ? pd.meta : null

  const companyName = (plan.companies as unknown as { name: string } | null)?.name ?? '—'
  const projectName = (plan.projects as unknown as { name: string } | null)?.name ?? null

  return (
    <div className={`${PAGE_WRAPPER} max-w-6xl mx-auto`}>
      <PageHeader
        title={`Kế hoạch thuế ${plan.year}`}
        subtitle={`${companyName}${projectName ? ` · ${projectName}` : ' · toàn công ty'}`}
        breadcrumb={
          <>
            <Link href="/ke-hoach-thue" className="hover:text-brand-700">Kế hoạch thuế</Link>
            <span className="mx-1.5">/</span>
            <span className="font-medium text-gray-900">{plan.year}</span>
          </>
        }
      />

      <TaxPlanTemplateForm
        companyId={plan.company_id}
        companyName={companyName}
        projectId={plan.project_id}
        projectName={projectName}
        year={plan.year}
        initial={initialRows ? { rows: initialRows, meta: initialMeta } : null}
      />
    </div>
  )
}
