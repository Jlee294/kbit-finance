export type PartnerType = 'customer' | 'supplier'
export type PostingKind = 'opening' | 'receipt' | 'issue' | 'adjustment'

export interface SalesDocumentPolicyInput {
  isGift: boolean
  hasStockItems: boolean
}

export interface SalesDocumentPolicy {
  includeInTaxListing: boolean
  includeInInventoryJournal: boolean
  recognizeRevenue: boolean
  createReceivable: boolean
  postInventory: boolean
  recognizeCogs: boolean
}

export function classifySalesDocument(input: SalesDocumentPolicyInput): SalesDocumentPolicy {
  return {
    includeInTaxListing: true,
    includeInInventoryJournal: input.hasStockItems,
    recognizeRevenue: !input.isGift,
    createReceivable: !input.isGift,
    postInventory: input.hasStockItems,
    recognizeCogs: input.hasStockItems,
  }
}

export function openingDebtNet(
  partnerType: PartnerType,
  debitAmount: number,
  creditAmount: number,
): number {
  return partnerType === 'customer'
    ? debitAmount - creditAmount
    : creditAmount - debitAmount
}

export interface PostingEvent {
  date: string
  kind: PostingKind
  sourceIndex: number
}

const POSTING_PRIORITY: Record<PostingKind, number> = {
  opening: 0,
  receipt: 1,
  issue: 2,
  adjustment: 3,
}

export function comparePostingEvents(a: PostingEvent, b: PostingEvent): number {
  return a.date.localeCompare(b.date)
    || POSTING_PRIORITY[a.kind] - POSTING_PRIORITY[b.kind]
    || a.sourceIndex - b.sourceIndex
}

export function computeCashBalance(opening: number, receipts: number, payments: number): number {
  return opening + receipts - payments
}
