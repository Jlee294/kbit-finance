export type ImportCostKind =
  | 'goods'
  | 'import_duty'
  | 'import_vat'
  | 'freight'
  | 'service'
  | 'other'

export interface ImportCostComponent {
  kind: ImportCostKind
  amount: number
  exchangeRate: number
  capitalizable: boolean
}

export interface LandedCostSummary {
  landedCostVnd: number
  recoverableTaxVnd: number
  payableVnd: number
}

const roundVnd = (value: number) => Math.round(value * 100) / 100

export function calculateLandedCostVnd(components: ImportCostComponent[]): LandedCostSummary {
  return components.reduce<LandedCostSummary>((summary, component) => {
    const valueVnd = roundVnd(component.amount * component.exchangeRate)
    return {
      landedCostVnd: roundVnd(
        summary.landedCostVnd + (component.capitalizable ? valueVnd : 0),
      ),
      recoverableTaxVnd: roundVnd(
        summary.recoverableTaxVnd
        + (component.kind === 'import_vat' && !component.capitalizable ? valueVnd : 0),
      ),
      payableVnd: roundVnd(summary.payableVnd + valueVnd),
    }
  }, { landedCostVnd: 0, recoverableTaxVnd: 0, payableVnd: 0 })
}

export interface LandedCostItem {
  quantity: number
  goodsValueVnd: number
}

export interface AllocatedLandedCost {
  allocatedValueVnd: number
  unitCostVnd: number
}

export function allocateLandedCost(
  items: LandedCostItem[],
  landedCostVnd: number,
): AllocatedLandedCost[] {
  if (items.length === 0) return []

  const totalGoodsValue = items.reduce((sum, item) => sum + item.goodsValueVnd, 0)
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const allocatedValues = items.map((item) => {
    if (totalGoodsValue > 0) {
      return roundVnd((item.goodsValueVnd / totalGoodsValue) * landedCostVnd)
    }
    if (totalQuantity > 0) {
      return roundVnd((item.quantity / totalQuantity) * landedCostVnd)
    }
    return 0
  })

  const allocatedTotal = allocatedValues.reduce((sum, value) => sum + value, 0)
  allocatedValues[allocatedValues.length - 1] = roundVnd(
    allocatedValues[allocatedValues.length - 1] + landedCostVnd - allocatedTotal,
  )

  return allocatedValues.map((allocatedValueVnd, index) => ({
    allocatedValueVnd,
    unitCostVnd: items[index].quantity > 0
      ? roundVnd(allocatedValueVnd / items[index].quantity)
      : 0,
  }))
}
