export type PurchaseTreatment =
  | 'inventory'
  | 'expense'
  | 'prepaid'
  | 'tool'
  | 'fixed_asset'
  | 'tax_fee'
  | 'pass_through'
  | 'contract_penalty'
  | 'other'

export interface ProfitLossInput {
  recognizedRevenue: number
  giftDeclaredValue: number
  cogs: number
  purchases: Array<{ amount: number; treatment: PurchaseTreatment }>
}

export interface ProfitLossResult {
  revenue: number
  cogs: number
  operatingExpenses: number
  profit: number
  giftDeclaredValue: number
  prepaid: number
  tools: number
  fixedAssets: number
  passThrough: number
  inventoryPurchases: number
}

export function calculateProfitLoss(input: ProfitLossInput): ProfitLossResult {
  let operatingExpenses = 0
  let prepaid = 0
  let tools = 0
  let fixedAssets = 0
  let passThrough = 0
  let inventoryPurchases = 0

  for (const purchase of input.purchases) {
    switch (purchase.treatment) {
      case 'inventory':
        inventoryPurchases += purchase.amount
        break
      case 'prepaid':
        prepaid += purchase.amount
        break
      case 'tool':
        tools += purchase.amount
        break
      case 'fixed_asset':
        fixedAssets += purchase.amount
        break
      case 'pass_through':
        passThrough += purchase.amount
        break
      case 'expense':
      case 'tax_fee':
      case 'contract_penalty':
      case 'other':
        operatingExpenses += purchase.amount
        break
    }
  }

  return {
    revenue: input.recognizedRevenue,
    cogs: input.cogs,
    operatingExpenses,
    profit: input.recognizedRevenue - input.cogs - operatingExpenses,
    giftDeclaredValue: input.giftDeclaredValue,
    prepaid,
    tools,
    fixedAssets,
    passThrough,
    inventoryPurchases,
  }
}
