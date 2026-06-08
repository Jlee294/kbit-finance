export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('vi-VN').format(new Date(date))
}

/**
 * Ngày của `date` theo giờ Việt Nam (Asia/Ho_Chi_Minh), dạng YYYY-MM-DD.
 * Dùng thay cho `new Date().toISOString().slice(0,10)` (vốn là giờ UTC → lệch
 * ngày khi nhập lúc 0–7h sáng giờ VN).
 */
export function formatLocalDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayLocal(): string {
  return formatLocalDate(new Date())
}
