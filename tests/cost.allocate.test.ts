import { test, expect } from 'vitest'
import { allocateUnitCost } from '@/features/imports/cost'

test('lô 1.000 SP: giá vốn lô 112tr → unit_cost = 112.000đ', () => {
  const costTotal = 100_000_000 + 10_000_000 + 2_000_000 // = 112tr, KHÔNG gồm vat_import 11tr
  const [uc] = allocateUnitCost([{ qty: 1000, unit_price: 100_000 }], costTotal)
  expect(uc).toBe(112_000)
})

test('nhiều dòng: phân bổ theo tỷ trọng giá trị, Σ(unit_cost×qty) = cost_total', () => {
  // A: 600 SP @100k = 60tr; B: 400 SP @100k = 40tr; Σline = 100tr
  const costTotal = 100_000_000 + 10_000_000 + 2_000_000 // 112tr
  const ucs = allocateUnitCost(
    [{ qty: 600, unit_price: 100_000 }, { qty: 400, unit_price: 100_000 }],
    costTotal,
  )
  expect(ucs).toEqual([112_000, 112_000])
  const sum = ucs[0] * 600 + ucs[1] * 400
  expect(sum).toBe(112_000_000) // không lệch xu
})

test('giá khác nhau: phân bổ đúng tỷ trọng', () => {
  // A: 100 SP @300k = 30tr (75%); B: 100 SP @100k = 10tr (25%); Σline = 40tr
  const ucs = allocateUnitCost(
    [{ qty: 100, unit_price: 300_000 }, { qty: 100, unit_price: 100_000 }],
    40_000_000, // cost_total = Σline → unit_cost = unit_price
  )
  expect(ucs).toEqual([300_000, 100_000])
})

test('đơn KRW: costTotal quy VND → unit_cost ra VND (C3/D3)', () => {
  // goods 1.000.000 + duty 100.000 + other 20.000 = 1.120.000 KRW; tỷ giá 18
  // → costTotalVnd = 1.120.000 × 18 = 20.160.000đ; 1.000 SP → 20.160đ/SP
  const costTotalFc = 1_000_000 + 100_000 + 20_000
  const rate = 18
  const [uc] = allocateUnitCost([{ qty: 1000, unit_price: 1_000 }], costTotalFc * rate)
  expect(uc).toBe(20_160)
})

test('mọi unit_price = 0 → phân bổ đều theo số lượng', () => {
  const ucs = allocateUnitCost(
    [{ qty: 300, unit_price: 0 }, { qty: 700, unit_price: 0 }],
    100_000,
  )
  expect(ucs[0] * 300 + ucs[1] * 700).toBeCloseTo(100_000, 0)
})

test('1 dòng: unit_cost = costTotal / qty', () => {
  const [uc] = allocateUnitCost([{ qty: 50, unit_price: 200_000 }], 5_000_000)
  expect(uc).toBe(100_000)
})

test('mảng rỗng trả []', () => {
  expect(allocateUnitCost([], 1_000_000)).toEqual([])
})
