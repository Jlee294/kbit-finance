// Tính điều chỉnh tồn kho khi SỬA đơn bán đã trừ kho (BLOCKER 6).
// Trả về các thay đổi cần áp vào tồn: delta > 0 = HOÀN vào kho (giảm số lượng
// hoặc đổi mã hàng), delta < 0 = TRỪ thêm kho (tăng số lượng). Cho phép âm.

export interface StockItem { product_id: string | null; qty: number }
export interface StockDelta { warehouse_id: string; product_id: string; delta: number }

function sumByProduct(items: StockItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    if (!it.product_id) continue
    m.set(it.product_id, (m.get(it.product_id) ?? 0) + Number(it.qty))
  }
  return m
}

export function computeStockDeltas(
  oldItems: StockItem[],
  newItems: StockItem[],
  oldWarehouseId: string | null,
  newWarehouseId: string | null,
): StockDelta[] {
  const oldMap = sumByProduct(oldItems)
  const newMap = sumByProduct(newItems)
  const out: StockDelta[] = []

  if (oldWarehouseId && newWarehouseId && oldWarehouseId === newWarehouseId) {
    // Cùng kho → tính net theo từng mã hàng (hoàn cũ − trừ mới)
    const products = new Set([...oldMap.keys(), ...newMap.keys()])
    for (const pid of products) {
      const delta = (oldMap.get(pid) ?? 0) - (newMap.get(pid) ?? 0)
      if (delta !== 0) out.push({ warehouse_id: oldWarehouseId, product_id: pid, delta })
    }
  } else {
    // Khác kho (hoặc 1 bên bỏ chọn kho) → hoàn hết kho cũ, trừ hết kho mới
    if (oldWarehouseId) {
      for (const [pid, q] of oldMap) {
        if (q !== 0) out.push({ warehouse_id: oldWarehouseId, product_id: pid, delta: q })
      }
    }
    if (newWarehouseId) {
      for (const [pid, q] of newMap) {
        if (q !== 0) out.push({ warehouse_id: newWarehouseId, product_id: pid, delta: -q })
      }
    }
  }
  return out
}
