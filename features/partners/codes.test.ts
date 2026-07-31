import { describe, expect, it } from 'vitest'
import { defaultPartnerCode, nextSequentialCode } from './codes'

describe('defaultPartnerCode', () => {
  it('dùng MST làm mã công nợ khi có MST', () => {
    expect(defaultPartnerCode('customer', '0315226378', [])).toBe('0315226378')
    expect(defaultPartnerCode('supplier', '0315226378', [])).toBe('0315226378')
  })

  it('bán ra tự sinh KH, mua vào tự sinh NCC', () => {
    expect(defaultPartnerCode('customer', null, ['KH00001', 'KH00003'])).toBe('KH00004')
    expect(defaultPartnerCode('supplier', '', ['NCC00009'])).toBe('NCC00010')
  })
})

describe('nextSequentialCode', () => {
  it('bỏ qua mã không đúng mẫu và lấy số lớn nhất cộng một', () => {
    expect(nextSequentialCode('MH', ['MH00002', 'ABC', 'MH00010'])).toBe('MH00011')
  })
})
