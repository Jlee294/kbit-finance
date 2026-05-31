// ── Logic đèn THUẦN — không I/O, dễ unit-test ────────────────────────────────
// [⏳ A6] Quy tắc sức khỏe tổng tạm "CÓ ĐỎ LÀ ĐỎ".
//   Đổi sang "điểm số 0–100" → CHỈ sửa rollupOverall + thêm field điểm vào scores.
//   Toàn bộ lịch sử risk_assessments.scores.groups vẫn truy ngược được.

import type { RiskGroup } from './indicators'

export type Light = 'green' | 'yellow' | 'red'

export type Threshold = {
  yellow_at: number | null
  red_at:    number | null
}

export type ThresholdRow = {
  company_id:     string | null
  indicator_code: string
  yellow_at:      number | null
  red_at:         number | null
}

/**
 * Chọn ngưỡng đúng: ưu tiên dòng của đúng company_id, fallback sang áp chung (null).
 */
export function pickThreshold(
  rows:          ThresholdRow[],
  indicatorCode: string,
  companyId:     string,
): Threshold | undefined {
  const specific = rows.find(r => r.indicator_code === indicatorCode && r.company_id === companyId)
  if (specific) return specific
  const generic  = rows.find(r => r.indicator_code === indicatorCode && r.company_id === null)
  return generic
}

/**
 * So 1 chỉ tiêu với ngưỡng → đèn.
 * Ngưỡng thiếu → green + configured=false (chưa thiết lập không phải cảnh báo).
 *
 * higher_worse: value >= red_at → red; >= yellow_at → yellow; else green
 * lower_worse : value <= red_at → red; <= yellow_at → yellow; else green
 */
export function lightForIndicator(
  value:     number,
  direction: 'higher_worse' | 'lower_worse',
  t:         Threshold | undefined,
): { light: Light; configured: boolean } {
  if (!t || (t.red_at == null && t.yellow_at == null)) {
    return { light: 'green', configured: false }
  }
  const hitRed =
    t.red_at != null &&
    (direction === 'higher_worse' ? value >= t.red_at : value <= t.red_at)
  if (hitRed) return { light: 'red', configured: true }

  const hitYellow =
    t.yellow_at != null &&
    (direction === 'higher_worse' ? value >= t.yellow_at : value <= t.yellow_at)
  if (hitYellow) return { light: 'yellow', configured: true }

  return { light: 'green', configured: true }
}

/**
 * Rollup TRONG 1 nhóm: có đỏ → đỏ; có vàng → vàng; còn lại xanh.
 */
export function rollupGroup(lights: Light[]): Light {
  if (lights.includes('red'))    return 'red'
  if (lights.includes('yellow')) return 'yellow'
  return 'green'
}

/**
 * [⏳ A6] Rollup TỔNG từ đèn 5 nhóm — QUY TẮC TẠM "CÓ ĐỎ LÀ ĐỎ".
 * Đổi sang "điểm số 0–100" → CHỈ sửa hàm này + thêm field điểm vào scores.
 */
export function rollupOverall(groupLights: Record<RiskGroup, Light>): Light {
  const arr = Object.values(groupLights) as Light[]
  if (arr.includes('red'))    return 'red'
  if (arr.includes('yellow')) return 'yellow'
  return 'green'
}
