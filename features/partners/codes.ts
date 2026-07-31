export type PartnerCodeKind = 'customer' | 'supplier'

export function nextSequentialCode(prefix: string, existingCodes: string[]): string {
  const normalizedPrefix = prefix.toUpperCase()
  const matcher = new RegExp(`^${normalizedPrefix}(\\d+)$`, 'i')
  const max = existingCodes.reduce((currentMax, code) => {
    const match = code.trim().match(matcher)
    if (!match) return currentMax
    return Math.max(currentMax, Number(match[1]))
  }, 0)
  return `${normalizedPrefix}${String(max + 1).padStart(5, '0')}`
}

export function defaultPartnerCode(
  kind: PartnerCodeKind,
  taxCode: string | null | undefined,
  existingCodes: string[],
): string {
  const normalizedTaxCode = taxCode?.replace(/\s+/g, '').trim()
  if (normalizedTaxCode) return normalizedTaxCode
  return nextSequentialCode(kind === 'customer' ? 'KH' : 'NCC', existingCodes)
}
