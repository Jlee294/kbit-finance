import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { grossProfit } from '@/features/inventory-cost/queries'
import {
  getCompanyReport,
  getProfitAndLossSummary,
  getSalesPurchaseSummary,
} from './queries'

describe('GLA demo reports use natural-flow data', () => {
  beforeAll(() => vi.stubEnv('KBIT_DEMO_MODE', 'true'))
  afterAll(() => vi.unstubAllEnvs())

  it('keeps gift VAT in the sales listing but excludes gift value from revenue', async () => {
    const result = await getSalesPurchaseSummary({
      companyId: '10000000-0000-0000-0000-000000000003',
      from: '2026-01-01',
      to: '2026-06-30',
    })

    expect(result.salesCount).toBe(19)
    expect(result.revenue).toBe(354_175_146)
    expect(result.revenueNet).toBe(327_939_950)
    expect(result.revenueVat).toBe(26_968_529)
  })

  it('calculates profit from recognized revenue, moving-average COGS and non-stock expense', async () => {
    const result = await getProfitAndLossSummary({
      companyId: '10000000-0000-0000-0000-000000000003',
      from: '2026-01-01',
      to: '2026-06-30',
    })

    expect(result.revenue).toBe(327_939_950)
    expect(result.giftDeclaredValue).toBe(9_166_667)
    expect(result.cogs).toBeCloseTo(172_215_123.0065818, 5)
    expect(result.operatingExpenses).toBe(61_748_314)
    expect(result.profit).toBeCloseTo(93_976_512.99341819, 5)
  })

  it('takes cash flow from all explicit SPNH transactions', async () => {
    const result = await getCompanyReport({
      companyId: '10000000-0000-0000-0000-000000000003',
      from: '2026-01-01',
      to: '2026-06-30',
    })

    expect(result.total_income).toBe(272_720_169)
    expect(result.total_expense).toBe(435_547_666)
    expect(result.net_cash_flow).toBe(-162_827_497)
  })

  it('shows gift issues as cost without creating revenue in gross-profit detail', async () => {
    const result = await grossProfit(
      '2026-01-01',
      '2026-06-30',
      '10000000-0000-0000-0000-000000000003',
    )

    expect(result.total.revenue).toBe(327_939_950)
    expect(result.total.cogs).toBeGreaterThan(171_708_428)
  })
})
