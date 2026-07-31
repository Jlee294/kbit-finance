const MAX_ABS_OPENING = 999_999_999_999_999

export function canEnterBankOpening(input: {
  canWrite: boolean
  demoMode: boolean
}) {
  return input.canWrite || input.demoMode
}

export function toDemoOpeningCookieName(bankAccountId: string, year: number) {
  const safeAccountId = bankAccountId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `kbit_demo_bank_opening_${year}_${safeAccountId}`
}

export function parseDemoOpeningValue(raw: string | null) {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && Math.abs(value) <= MAX_ABS_OPENING
    ? value
    : null
}
