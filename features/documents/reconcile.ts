/**
 * Phase 6 — Document reconciliation logic.
 *
 * reconcileDocs: pure function — does NOT touch DB.
 *   Compares the operation's required_doc_type_ids against verified docs on an entity.
 *   Returns: { isComplete, present, missing }
 *
 * reconcileEntity: async — queries DB, calls reconcileDocs, returns result.
 *   Exported for Phase 7 reuse (confirmExpense, confirmImport, ...).
 *
 * confirmExpense: checks reconcileEntity; if incomplete → auto-creates tasks + throws.
 *   if complete → updates status = 'confirmed'.
 */

import { createClient } from '@/lib/supabase/server'
import type { DocEntityType } from './schema'

// ────────────────────────────────────────────────────
// Pure reconciliation function (unit-testable)
// ────────────────────────────────────────────────────

export interface ReconcileResult {
  isComplete: boolean
  /** type IDs that are required AND have a verified doc */
  present: string[]
  /** type IDs that are required but have NO verified doc */
  missing: string[]
}

/**
 * @param requiredTypeIds  - from operation_library.required_doc_type_ids
 * @param verifiedTypeIds  - document_type_ids of docs that are is_verified = true for the entity
 */
export function reconcileDocs(
  requiredTypeIds: string[],
  verifiedTypeIds: string[],
): ReconcileResult {
  const verifiedSet = new Set(verifiedTypeIds)
  const present = requiredTypeIds.filter((id) => verifiedSet.has(id))
  const missing = requiredTypeIds.filter((id) => !verifiedSet.has(id))
  return {
    isComplete: missing.length === 0,
    present,
    missing,
  }
}

// ────────────────────────────────────────────────────
// Async reconciliation (queries DB)
// ────────────────────────────────────────────────────

export interface ReconcileEntityResult extends ReconcileResult {
  /** code of missing doc types — for human-readable error */
  missingCodes: string[]
  /** when entity has no operation_id → treat as complete (no checklist) */
  noOperation: boolean
}

export async function reconcileEntity(
  entityType: DocEntityType,
  entityId: string,
  operationId: string | null,
): Promise<ReconcileEntityResult> {
  const supabase = await createClient()

  // No operation → no checklist → always complete
  if (!operationId) {
    return { isComplete: true, present: [], missing: [], missingCodes: [], noOperation: true }
  }

  // Fetch required_doc_type_ids from operation
  const { data: op, error: opErr } = await supabase
    .from('operation_library')
    .select('required_doc_type_ids')
    .eq('id', operationId)
    .single()
  if (opErr) throw new Error(opErr.message)

  const requiredTypeIds: string[] = (op?.required_doc_type_ids as string[]) ?? []

  if (requiredTypeIds.length === 0) {
    return { isComplete: true, present: [], missing: [], missingCodes: [], noOperation: false }
  }

  // Fetch verified doc type IDs for this entity
  const { data: docs, error: docErr } = await supabase
    .from('documents')
    .select('document_type_id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('is_verified', true)
  if (docErr) throw new Error(docErr.message)

  const verifiedTypeIds = (docs ?? []).map((d) => d.document_type_id as string)

  const result = reconcileDocs(requiredTypeIds, verifiedTypeIds)

  // Resolve missing codes for error messages
  let missingCodes: string[] = []
  if (result.missing.length > 0) {
    const { data: types } = await supabase
      .from('document_types')
      .select('id, code')
      .in('id', result.missing)
    missingCodes = (types ?? []).map((t) => t.code as string)
  }

  return { ...result, missingCodes, noOperation: false }
}

// ────────────────────────────────────────────────────
// confirmExpense — update expense status to 'confirmed'
// Throws 'THIEU_HO_SO:<codes>' when docs incomplete.
// Auto-creates tasks for each missing doc type.
// ────────────────────────────────────────────────────

export async function confirmExpense(expenseId: string): Promise<void> {
  const supabase = await createClient()

  // Fetch expense to get operation_id
  const { data: exp, error: expErr } = await supabase
    .from('expense_transactions')
    .select('id, status, operation_id')
    .eq('id', expenseId)
    .single()
  if (expErr) throw new Error(expErr.message)
  if (!exp) throw new Error('Không tìm thấy chi phí')
  if (exp.status === 'confirmed') return // already confirmed — idempotent

  const rec = await reconcileEntity('expense', expenseId, exp.operation_id as string | null)

  if (!rec.isComplete) {
    // Auto-create one task per missing doc type
    const { data: { user } } = await supabase.auth.getUser()
    let assignedTo: string | null = null
    if (user) {
      const { data: u } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', user.id)
        .single()
      assignedTo = u?.id ?? null
    }

    const tasks = rec.missing.map((typeId, i) => ({
      title: `Bổ sung chứng từ: ${rec.missingCodes[i] ?? typeId}`,
      related_entity_type: 'expense',
      related_entity_id: expenseId,
      auto_generated: true,
      assigned_to: assignedTo,
    }))

    if (tasks.length > 0) {
      await supabase.from('tasks').insert(tasks)
    }

    throw new Error(`THIEU_HO_SO:${rec.missingCodes.join(',')}`)
  }

  // Docs complete — confirm the expense
  const { error: updErr } = await supabase
    .from('expense_transactions')
    .update({ status: 'confirmed' })
    .eq('id', expenseId)
  if (updErr) throw new Error(updErr.message)
}
