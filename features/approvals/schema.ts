import { z } from 'zod'

export const txnKindEnum = z.enum(['income', 'expense'])
export type TxnKind = z.infer<typeof txnKindEnum>

export const transitionSchema = z.object({
  kind: txnKindEnum,
  id:   z.string().uuid(),
  to:   z.enum(['confirmed', 'approved', 'void', 'draft']),
})
export type TransitionInput = z.infer<typeof transitionSchema>
