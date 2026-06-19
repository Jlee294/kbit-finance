/**
 * Khoảng ngày [from, to] từ NĂM (+ THÁNG tùy chọn). Hàm THUẦN (test được).
 *   year='2026', month rỗng  → 2026-01-01 .. 2026-12-31 (cả năm)
 *   year='2026', month='3'   → 2026-03-01 .. 2026-03-31 (riêng tháng 3)
 * Dùng cho lọc toàn cục: Năm (global) + Tháng (per-sheet).
 */
export function yearMonthRange(year: string, period?: string | null): { from: string; to: string } {
  const y = Number(year)
  const p = (period ?? '').toLowerCase().trim()

  // Theo QUÝ: 'q1'..'q4'
  if (/^q[1-4]$/.test(p)) {
    const q = Number(p[1])
    const startM = (q - 1) * 3 + 1            // 1,4,7,10
    const endM   = startM + 2                 // 3,6,9,12
    const lastDay = new Date(y, endM, 0).getDate()
    return {
      from: `${y}-${String(startM).padStart(2, '0')}-01`,
      to:   `${y}-${String(endM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    }
  }

  // Theo THÁNG: '1'..'12'
  if (p && p !== '') {
    const m = Number(p)
    if (m >= 1 && m <= 12) {
      const mm = String(m).padStart(2, '0')
      const lastDay = new Date(y, m, 0).getDate()
      return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` }
    }
  }

  // Cả năm
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

/**
 * Khoảng ngày cuối cùng cho 1 sheet: ưu tiên from/to người dùng nhập tay;
 * nếu không thì theo Năm (global) + Tháng (per-sheet).
 */
export function resolveRange(
  year: string,
  period?: string | null,   // '' | '1'..'12' | 'q1'..'q4'
  from?: string | null,
  to?: string | null,
): { from: string; to: string } {
  if (from || to) {
    return { from: from || `${year}-01-01`, to: to || `${year}-12-31` }
  }
  return yearMonthRange(year, period)
}
