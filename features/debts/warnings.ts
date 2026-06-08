/**
 * Cảnh báo công nợ (Đợt 3 — C & D). Hàm THUẦN, test được độc lập.
 */

/**
 * C — Đối tượng bị thu/trả VƯỢT số nợ: tổng đã thu/trả > tổng phát sinh → số dư
 * cuối kỳ ÂM. Tín hiệu rõ ràng của ghi trùng / thu dư (cần kiểm tra), ít báo nhầm.
 */
export function isOverSettled(row: { closing: number }): boolean {
  return row.closing < 0
}

/**
 * D — Phiếu thu cọc CHƯA gắn đơn nhưng khách hàng ĐANG còn công nợ (có dòng phải
 * thu cuối kỳ > 0) → nên gắn tiền vào đơn để không treo công nợ ảo.
 */
export function depositNeedsAllocation(
  deposit: { customer_id: string | null },
  receivableRows: { party_id: string; closing: number }[],
): boolean {
  if (!deposit.customer_id) return false
  return receivableRows.some((r) => r.party_id === deposit.customer_id && r.closing > 0)
}
