import type { CurrentUser } from '@/lib/auth'
import { GLA_DATA } from '@/lib/gla-data'

export function isDemoMode() {
  return process.env.KBIT_DEMO_MODE === 'true'
}

export const DEMO_USER: CurrentUser = {
  id: '00000000-0000-0000-0000-000000000001',
  full_name: 'Anh Thịnh — GLA local',
  role: 'viewer',
}

export const DEMO_COMPANIES = [
  {
    id: GLA_DATA.company.id,
    code: GLA_DATA.company.code,
    name: GLA_DATA.company.name,
    country: GLA_DATA.company.country,
    base_currency: GLA_DATA.company.baseCurrency,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
]
