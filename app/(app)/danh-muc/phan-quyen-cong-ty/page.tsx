import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/auth'
import { listUsersWithCompanies } from '@/features/users/queries'
import { listCompanies } from '@/features/companies/queries'
import { CompanyAccessClient } from '@/features/users/components/CompanyAccessClient'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { getT } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

export default async function PhanQuyenCongTyPage() {
  const me = await getCurrentUser()
  if (!me || !isAdmin(me.role)) redirect('/')   // chỉ admin
  const t = await getT()

  const [users, companies] = await Promise.all([listUsersWithCompanies(), listCompanies()])

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Người dùng & Phân quyền')}
        subtitle={t('Thêm tài khoản, đổi vai trò, gán công ty — admin/giám đốc/kế toán trưởng thấy tất cả; còn lại chỉ thấy công ty được gán')}
      />
      <CompanyAccessClient
        users={users}
        companies={companies.map((c: any) => ({ id: c.id, name: c.name }))}
      />
    </div>
  )
}
