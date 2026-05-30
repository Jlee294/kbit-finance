import { listExchangeRates } from '@/features/exchange-rates/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { ExchangeRateCatalog } from '@/features/exchange-rates/components/ExchangeRateCatalog'

export default async function ExchangeRatePage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listExchangeRates()])
  return <ExchangeRateCatalog rows={rows} canWrite={me ? canApprove(me.role) : false} />
}
