// ── Metric registry — Phase 9 ────────────────────────────────────────────────
// Danh sách MỞ RỘNG được: thêm chỉ tiêu = thêm 1 dòng INDICATORS +
//   1 hàm compute<Code> ở compute.ts + 1 dòng risk_thresholds. KHÔNG đụng UI.

export type RiskGroup = 'finance' | 'debt' | 'tax' | 'documents' | 'operations'

export const GROUP_LABELS: Record<RiskGroup, string> = {
  finance:    'Tài chính',
  debt:       'Công nợ',
  tax:        'Thuế',
  documents:  'Chứng từ',
  operations: 'Vận hành',
}

// direction:
//   'higher_worse' = giá trị càng CAO càng rủi ro (so >= ngưỡng để bật đèn xấu)
//   'lower_worse'  = giá trị càng THẤP càng rủi ro (so <= ngưỡng)
export type Indicator = {
  code:      string                            // = risk_thresholds.indicator_code
  group:     RiskGroup
  label:     string
  unit:      'vnd' | 'days' | 'percent' | 'count'
  direction: 'higher_worse' | 'lower_worse'
}

export const INDICATORS: Indicator[] = [
  // ── Công nợ ───────────────────────────────────────────────────────────────
  { code: 'OVERDUE_DEBT', group: 'debt',       label: 'Công nợ KH quá hạn',               unit: 'vnd',     direction: 'higher_worse' },
  { code: 'DSO',          group: 'debt',       label: 'Kỳ thu tiền bình quân (DSO)',       unit: 'days',    direction: 'higher_worse' },
  // ── Tài chính ─────────────────────────────────────────────────────────────
  { code: 'NET_CASHFLOW', group: 'finance',    label: 'Dòng tiền thuần kỳ',               unit: 'vnd',     direction: 'lower_worse'  },
  { code: 'CASH_BALANCE', group: 'finance',    label: 'Số dư tiền hiện có',               unit: 'vnd',     direction: 'lower_worse'  },
  // ── Thuế ──────────────────────────────────────────────────────────────────
  { code: 'TAX_DUE_SOON', group: 'tax',        label: 'Nghĩa vụ thuế đến hạn ≤7 ngày',   unit: 'count',   direction: 'higher_worse' },
  { code: 'TAX_OVERDUE',  group: 'tax',        label: 'Nghĩa vụ thuế quá hạn',           unit: 'count',   direction: 'higher_worse' },
  // ── Chứng từ ──────────────────────────────────────────────────────────────
  { code: 'MISSING_DOCS', group: 'documents',  label: 'Giao dịch thiếu chứng từ bắt buộc', unit: 'count', direction: 'higher_worse' },
  // ── Vận hành ──────────────────────────────────────────────────────────────
  { code: 'STALE_DRAFTS', group: 'operations', label: 'Giao dịch draft tồn >7 ngày',     unit: 'count',   direction: 'higher_worse' },
]

export const INDICATORS_BY_CODE = Object.fromEntries(INDICATORS.map(i => [i.code, i]))

export function indicatorsOfGroup(g: RiskGroup): Indicator[] {
  return INDICATORS.filter(i => i.group === g)
}
