export function orderDateToMMYY(orderDate: string): string {
  const parts = orderDate.split('-')
  const mm = parts[1]
  const yy = orderDate.slice(2, 4)
  return `${mm}${yy}`
}

export function orderCodePrefix(customerCode: string, orderDate: string): string {
  return `${customerCode}-${orderDateToMMYY(orderDate)}-`
}

export function buildOrderCode(customerCode: string, orderDate: string, seq: number): string {
  const nn = String(seq).padStart(2, '0')
  return `${orderCodePrefix(customerCode, orderDate)}${nn}`
}
