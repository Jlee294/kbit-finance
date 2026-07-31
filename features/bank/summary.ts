export interface BankMovement {
  txnDate: string
  direction: 'thu' | 'chi'
  amount: number
}

export interface BankSummaryResult {
  declaredOpening: number
  opening: number
  receipts: number
  payments: number
  closing: number
}

export function calculateBankSummary(input: {
  declaredOpening: number
  year: number
  from: string
  to: string
  movements: BankMovement[]
}): BankSummaryResult {
  const yearFrom = `${input.year}-01-01`
  let opening = input.declaredOpening
  let receipts = 0
  let payments = 0

  for (const movement of input.movements) {
    if (movement.txnDate < yearFrom || movement.txnDate > input.to) continue
    const amount = Number(movement.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue

    if (movement.txnDate < input.from) {
      opening += movement.direction === 'thu' ? amount : -amount
    } else if (movement.direction === 'thu') {
      receipts += amount
    } else {
      payments += amount
    }
  }

  return {
    declaredOpening: input.declaredOpening,
    opening,
    receipts,
    payments,
    closing: opening + receipts - payments,
  }
}
