import { notFound } from 'next/navigation'
import { getManufacturer, listFormulas, listManufacturerPrices } from '@/features/manufacturers/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { ManufacturerDetail } from '@/features/manufacturers/components/ManufacturerDetail'

export const dynamic = 'force-dynamic'

export default async function ManufacturerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [me, manufacturer, formulas, prices] = await Promise.all([
    getCurrentUser(),
    getManufacturer(id),
    listFormulas(id),
    listManufacturerPrices(id),
  ])

  if (!manufacturer) notFound()

  return (
    <ManufacturerDetail
      manufacturer={manufacturer}
      formulas={formulas}
      prices={prices}
      canWrite={me ? canApprove(me.role) : false}
    />
  )
}
