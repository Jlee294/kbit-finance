/**
 * Tính giá vốn bình quân gia quyền CUỐI KỲ cho 1 mã / 1 tháng. Hàm THUẦN (không chạm DB).
 *   avgUnitCost = (valueOpen + valueIn) / (qtyOpen + qtyIn)   [0 nếu mẫu số ≤ 0]
 *   valueOut    = qtyOut × avgUnitCost
 *   qtyClose    = qtyOpen + qtyIn − qtyOut
 *   valueClose  = valueOpen + valueIn − valueOut
 */
export interface PeriodCostInput {
  qtyOpen: number; valueOpen: number
  qtyIn: number;   valueIn: number
  qtyOut: number
}
export interface PeriodCostResult {
  avgUnitCost: number; valueOut: number
  qtyClose: number; valueClose: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function computePeriodCost(i: PeriodCostInput): PeriodCostResult {
  const avail = i.qtyOpen + i.qtyIn
  const avgUnitCost = avail > 0 ? round2((i.valueOpen + i.valueIn) / avail) : 0
  const valueOut = round2(i.qtyOut * avgUnitCost)
  const qtyClose = round2(i.qtyOpen + i.qtyIn - i.qtyOut)
  const valueClose = round2(i.valueOpen + i.valueIn - valueOut)
  return { avgUnitCost, valueOut, qtyClose, valueClose }
}

// ── Tổng hợp lãi gộp (hàm THUẦN) ─────────────────────────────────────────────
export interface GrossRow {
  product_id: string; qty: number; unit_price: number; cost_price: number | null
  product_code?: string; product_name?: string; order_code?: string
}
export interface GrossLine { key: string; label: string; revenue: number; cogs: number; profit: number; margin: number }
export interface GrossSummary {
  total: { revenue: number; cogs: number; profit: number; margin: number }
  byProduct: GrossLine[]; byOrder: GrossLine[]
}

const pct = (profit: number, revenue: number) => (revenue !== 0 ? round2((profit / revenue) * 100) : 0)

/** Chọn kỳ (YYYY-MM) LỚN NHẤT từ danh sách ngày (YYYY-MM-DD…). null nếu không có ngày hợp lệ.
 *  Dùng để trang Lãi gộp tự mở kỳ gần nhất CÓ dữ liệu thay vì tháng hiện tại (thường trống). */
export function pickLatestPeriod(orderDates: (string | null | undefined)[]): string | null {
  let best: string | null = null
  for (const d of orderDates) {
    const p = (d ?? '').slice(0, 7)
    if (p.length === 7 && (best === null || p > best)) best = p
  }
  return best
}

/** Gộp các dòng bán (đã có giá vốn) thành lãi gộp 3 mức: tổng / theo mã / theo đơn. */
export function summarizeGrossProfit(rows: GrossRow[]): GrossSummary {
  let tRev = 0, tCogs = 0
  const prodMap = new Map<string, GrossLine>()
  const orderMap = new Map<string, GrossLine>()
  const bump = (m: Map<string, GrossLine>, key: string, label: string, revenue: number, cogs: number, profit: number) => {
    const p = m.get(key) ?? { key, label, revenue: 0, cogs: 0, profit: 0, margin: 0 }
    p.revenue = round2(p.revenue + revenue); p.cogs = round2(p.cogs + cogs); p.profit = round2(p.profit + profit)
    p.margin = pct(p.profit, p.revenue); m.set(key, p)
  }
  for (const r of rows) {
    const revenue = round2(r.qty * r.unit_price)
    const cogs = round2(r.qty * (r.cost_price ?? 0))
    const profit = round2(revenue - cogs)
    tRev = round2(tRev + revenue); tCogs = round2(tCogs + cogs)
    bump(prodMap, r.product_id, r.product_code ? `[${r.product_code}] ${r.product_name ?? ''}` : r.product_id, revenue, cogs, profit)
    bump(orderMap, r.order_code ?? '—', r.order_code ?? '—', revenue, cogs, profit)
  }
  const tProfit = round2(tRev - tCogs)
  return {
    total: { revenue: tRev, cogs: tCogs, profit: tProfit, margin: pct(tProfit, tRev) },
    byProduct: [...prodMap.values()],
    byOrder: [...orderMap.values()],
  }
}
