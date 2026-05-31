/**
 * Phân bổ giá vốn nhập khẩu — hàm THUẦN (không chạm DB).
 * Test được độc lập bằng số thật.
 *
 * Công thức: unit_cost_i = (line_total_i / Σ line_total) × costTotal / qty_i
 *   - Mẫu số = Σ line_total (không dùng goods_value header) → bền vững dù lệch nhỏ
 *   - Dồn phần dư làm tròn vào dòng cuối → Σ(unit_cost_i × qty_i) === costTotal chính xác
 *
 * ĐƠN VỊ (C3/D3): caller PHẢI truyền costTotal đã quy VND:
 *   - Đơn VND:  costTotal = goods_value + import_duty + other_fees  (không đổi)
 *   - Đơn KRW:  costTotal = (goods_value + import_duty + other_fees) × exchange_rate
 * Hàm này không biết currency — chỉ phân bổ con số đưa vào.
 */

export interface AllocInputItem { qty: number; unit_price: number }

export function allocateUnitCost(items: AllocInputItem[], costTotal: number): number[] {
  const n = items.length
  if (n === 0) return []

  const round2 = (x: number) => Math.round(x * 100) / 100

  const lineTotals = items.map((it) => it.qty * it.unit_price)
  const sumLine    = lineTotals.reduce((a, b) => a + b, 0)
  const sumQty     = items.reduce((a, b) => a + b.qty, 0)

  // allocated_cost_i = tiền giá vốn phân bổ cho cả dòng i (chưa chia qty)
  let allocated: number[]
  if (sumLine > 0) {
    allocated = lineTotals.map((lt) => (lt / sumLine) * costTotal)
  } else if (sumQty > 0) {
    // mọi unit_price = 0 → phân bổ đều theo số lượng
    allocated = items.map((it) => (it.qty / sumQty) * costTotal)
  } else {
    return items.map(() => 0)
  }

  // Làm tròn 2 chữ số, dồn dư vào dòng cuối → Σ allocated = costTotal
  const roundedAlloc = allocated.map(round2)
  const diff = round2(costTotal - roundedAlloc.reduce((a, b) => a + b, 0))
  roundedAlloc[n - 1] = round2(roundedAlloc[n - 1] + diff)

  // unit_cost_i = allocated_cost_i / qty_i
  return roundedAlloc.map((ac, i) =>
    items[i].qty > 0 ? round2(ac / items[i].qty) : 0,
  )
}
