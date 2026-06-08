/**
 * Giá vốn bình quân LIÊN HOÀN (moving average) — hàm THUẦN (không chạm DB).
 * Đơn giá BQ tính theo MÃ (gộp mọi kho). Phải KHỚP với logic plpgsql trong
 * migration 0030 (kbit_mc_receive / kbit_mc_issue).
 *   Nhập:  avg' = (qty*avg + q*u) / (qty+q)   nếu qty > 0; ngược lại avg' = u
 *   Xuất:  avg KHÔNG đổi; giá vốn xuất = avg hiện hành
 * Quy ước làm tròn: chỉ round 2 chữ số cho ĐƠN GIÁ (avg, unit_cost); KHÔNG round số lượng.
 */
export interface MovingState { qty: number; avg: number }

const round2 = (x: number) => Math.round(x * 100) / 100

export function applyReceipt(
  s: MovingState, qty: number, unitCost: number | null,
): { state: MovingState; lineUnitCost: number } {
  const u = unitCost ?? s.avg
  const newQty = s.qty + qty
  const newAvg = s.qty > 0 ? round2((s.qty * s.avg + qty * u) / (s.qty + qty)) : round2(u)
  return { state: { qty: newQty, avg: newAvg }, lineUnitCost: round2(u) }
}

export function applyIssue(
  s: MovingState, qty: number,
): { state: MovingState; lineUnitCost: number } {
  return { state: { qty: s.qty - qty, avg: s.avg }, lineUnitCost: round2(s.avg) }
}
