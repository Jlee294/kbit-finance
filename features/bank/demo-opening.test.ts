import { describe, expect, it } from 'vitest'
import {
  canEnterBankOpening,
  parseDemoOpeningValue,
  toDemoOpeningCookieName,
} from './demo-opening'

describe('local bank opening entry', () => {
  it('allows entry in local demo mode without granting production viewer write access', () => {
    expect(canEnterBankOpening({ canWrite: false, demoMode: true })).toBe(true)
    expect(canEnterBankOpening({ canWrite: false, demoMode: false })).toBe(false)
    expect(canEnterBankOpening({ canWrite: true, demoMode: false })).toBe(true)
  })

  it('creates a stable cookie name without unsafe account-id characters', () => {
    expect(toDemoOpeningCookieName('gla-bank/tcb', 2026))
      .toBe('kbit_demo_bank_opening_2026_gla-bank_tcb')
  })

  it('accepts a safe saved amount and rejects malformed or out-of-range values', () => {
    expect(parseDemoOpeningValue('200000000')).toBe(200_000_000)
    expect(parseDemoOpeningValue('not-a-number')).toBeNull()
    expect(parseDemoOpeningValue('1000000000000001')).toBeNull()
  })
})
