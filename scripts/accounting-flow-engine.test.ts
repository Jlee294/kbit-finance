import { describe, expect, it } from 'vitest'

import {
  deriveMovingAverageInventory,
  deriveTradeDebts,
} from './accounting-flow-engine.mjs'

describe('accounting flow engine', () => {
  it('preserves exact source product codes and receives before issuing on the same day', () => {
    const result = deriveMovingAverageInventory({
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      openings: [{
        productId: 'p-1',
        code: 'MiXeD-01',
        name: 'Hàng thử',
        unit: 'Cái',
        qtyOpen: 10,
        valueOpen: 1_000,
        accountCode: '1561',
      }],
      receipts: [{
        id: 'receipt-1',
        date: '2026-01-15',
        items: [{ productId: 'p-1', productCode: 'MiXeD-01', qty: 10, lineTotal: 3_000 }],
      }],
      issues: [{
        id: 'issue-1',
        date: '2026-01-15',
        items: [{ productId: 'p-1', productCode: 'MiXeD-01', qty: 5 }],
      }],
    })

    expect(result.summary).toEqual([expect.objectContaining({
      code: 'MiXeD-01',
      qtyOpen: 10,
      valueOpen: 1_000,
      qtyIn: 10,
      valueIn: 3_000,
      qtyOut: 5,
      valueOut: 1_000,
      qtyClose: 15,
      valueClose: 3_000,
      avgCost: 200,
    })])
  })

  it('rejects product codes absent from the source opening/master list', () => {
    expect(() => deriveMovingAverageInventory({
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      openings: [],
      receipts: [{
        id: 'receipt-1',
        date: '2026-01-10',
        items: [{ productId: '', productCode: 'AUTO-001', qty: 1, lineTotal: 100 }],
      }],
      issues: [],
    })).toThrow(/AUTO-001/)
  })

  it('derives AR and AP only from source-coded invoices and money documents', () => {
    const result = deriveTradeDebts({
      receivableOpenings: [{
        id: 'ar-1',
        partyId: 'c-1',
        partyCode: '131-GLa01',
        partyName: 'Khách A',
        taxCode: null,
        symbol: '131-GLa01',
        openingDebit: 100,
        openingCredit: 0,
      }],
      payableOpenings: [{
        id: 'ap-1',
        partyId: 's-1',
        partyCode: '331-Ncc01',
        partyName: 'NCC A',
        taxCode: null,
        symbol: '331-Ncc01',
        openingDebit: 0,
        openingCredit: 50,
      }],
      salesInvoices: [
        { affectsDebt: true, partyCode: '131-GLa01', amount: 300 },
        { affectsDebt: false, partyCode: '', amount: 999 },
      ],
      purchaseInvoices: [
        { affectsDebt: true, partyCode: '331-Ncc01', amount: 500 },
        { affectsDebt: false, partyCode: '', amount: 999 },
      ],
      moneyTransactions: [
        { affectsDebt: true, direction: 'thu', partyCode: '131-GLa01', amount: 250 },
        { affectsDebt: true, direction: 'chi', partyCode: '331-Ncc01', amount: 200 },
        { affectsDebt: false, direction: 'chi', partyCode: '', amount: 999 },
      ],
    })

    expect(result.receivables).toEqual([expect.objectContaining({
      partyCode: '131-GLa01',
      periodDebit: 300,
      periodCredit: 250,
      closingDebit: 150,
      closingCredit: 0,
    })])
    expect(result.payables).toEqual([expect.objectContaining({
      partyCode: '331-Ncc01',
      periodDebit: 200,
      periodCredit: 500,
      closingDebit: 0,
      closingCredit: 350,
    })])
  })

  it('blocks debt-affecting documents whose code is not present in Quyên source', () => {
    expect(() => deriveTradeDebts({
      receivableOpenings: [],
      payableOpenings: [],
      salesInvoices: [{ affectsDebt: true, partyCode: 'KH-TU-SINH', amount: 100 }],
      purchaseInvoices: [],
      moneyTransactions: [],
    })).toThrow(/KH-TU-SINH/)
  })
})
