/**
 * Tính "Bảng tổng hợp công nợ" theo kỳ (đầu kỳ / phát sinh / cuối kỳ) cho 1 đối
 * tượng (khách hàng hoặc nhà cung cấp), theo phương pháp THEO ĐƠN.
 *
 *   opening  = Σ (total − paid) của các đơn phát sinh TRƯỚC kỳ  (số dư mang sang)
 *   incurred = Σ total  của các đơn phát sinh TRONG kỳ          (phát sinh tăng)
 *   settled  = Σ paid   của các đơn phát sinh TRONG kỳ          (đã thu/đã trả)
 *   closing  = opening + incurred − settled
 *
 * Quy ước dấu (đều dương theo chiều "gốc"):
 *   - Phải thu (131): closing > 0  → khách còn nợ ta (cột Nợ cuối kỳ)
 *   - Phải trả (331): closing > 0  → ta còn nợ NCC  (cột Có cuối kỳ)
 *
 * LƯU Ý: `paid` là số đã thanh toán luỹ kế của đơn. Với năm đầu (không có đơn
 * trước kỳ) kết quả chính xác tuyệt đối. Đa kỳ + thanh toán trễ kỳ có thể xê
 * dịch phần "settled" — xem ghi chú trong kế hoạch.
 */
export interface LedgerSourceOrder {
  order_date: string   // 'YYYY-MM-DD'
  total:      number   // tổng phát sinh của đơn (VND)
  paid:       number   // đã thanh toán của đơn (VND)
}

export interface LedgerTotals {
  opening:  number
  incurred: number
  settled:  number
  closing:  number
}

/**
 * Quy 1 dòng "Chứng từ khác" (cash_book) gắn đối tượng công nợ về nguồn ledger.
 *   - AR (phải thu, TK 131): Thu → giảm nợ (paid); Chi → tăng nợ (total)
 *   - AP (phải trả, TK 331): Chi → giảm nợ (paid); Thu → tăng nợ (total)
 */
export interface CashLedgerEntry {
  txn_date:  string
  so_tien:   number          // luôn dương
  direction: 'thu' | 'chi'
}

export function cashEntryToLedgerSource(e: CashLedgerEntry, side: 'AR' | 'AP'): LedgerSourceOrder {
  const reduces = side === 'AR' ? e.direction === 'thu' : e.direction === 'chi'
  return reduces
    ? { order_date: e.txn_date, total: 0,         paid: e.so_tien }
    : { order_date: e.txn_date, total: e.so_tien, paid: 0 }
}

export function computeLedger(
  orders: LedgerSourceOrder[],
  yearStart: string,   // 'YYYY-01-01'
  yearEnd: string,     // 'YYYY-12-31'
): LedgerTotals {
  let opening = 0, incurred = 0, settled = 0
  for (const o of orders) {
    if (o.order_date < yearStart) {
      opening += o.total - o.paid
    } else if (o.order_date <= yearEnd) {
      incurred += o.total
      settled  += o.paid
    }
    // order_date > yearEnd: đơn ở kỳ tương lai → bỏ qua
  }
  return { opening, incurred, settled, closing: opening + incurred - settled }
}
