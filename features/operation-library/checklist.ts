import { createClient } from '@/lib/supabase/server'

/**
 * KTT D3: Checklist chứng từ cho 1 đơn theo nghiệp vụ (operation).
 * Trả về danh sách document_types BẮT BUỘC + đã có / chưa có theo
 * documents table (entity_type + entity_id).
 */

export type EntityType = 'customer_order' | 'supplier_order' | 'income' | 'expense'

export interface ChecklistItem {
  doc_type_id:   string
  doc_type_code: string
  doc_type_name: string
  required:      boolean   // true = required, false = recommended
  attached:      boolean   // true nếu có document đã upload với doc_type này
}

export interface OperationChecklistResult {
  operation_id:   string | null
  operation_name: string | null
  required:       ChecklistItem[]
  recommended:    ChecklistItem[]
  total_required: number
  attached_required: number
  is_complete:    boolean   // true = đủ tất cả required
}

export async function getOperationChecklist(
  operationId: string | null,
  entityType: EntityType,
  entityId: string | null,
): Promise<OperationChecklistResult> {
  const empty: OperationChecklistResult = {
    operation_id: null, operation_name: null,
    required: [], recommended: [],
    total_required: 0, attached_required: 0, is_complete: true,
  }
  if (!operationId) return empty

  const supabase = await createClient()
  const { data: op } = await supabase
    .from('operation_library')
    .select('id, name, required_doc_type_ids, recommended_doc_type_ids')
    .eq('id', operationId)
    .single()
  if (!op) return empty

  const allIds = [...(op.required_doc_type_ids ?? []), ...(op.recommended_doc_type_ids ?? [])]
  if (allIds.length === 0) {
    return { ...empty, operation_id: op.id, operation_name: op.name }
  }

  // Lấy thông tin các doc_types
  const { data: types } = await supabase
    .from('document_types')
    .select('id, code, name')
    .in('id', allIds)
  const typesMap = new Map<string, { code: string; name: string }>()
  for (const t of types ?? []) typesMap.set(t.id, { code: t.code, name: t.name })

  // Lấy documents đã upload cho entity này → tập hợp doc_type_id đã có
  const attached = new Set<string>()
  if (entityId) {
    const { data: docs } = await supabase
      .from('documents')
      .select('document_type_id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
    for (const d of docs ?? []) attached.add(d.document_type_id)
  }

  const mkItem = (id: string, required: boolean): ChecklistItem => {
    const t = typesMap.get(id)
    return {
      doc_type_id:   id,
      doc_type_code: t?.code ?? '???',
      doc_type_name: t?.name ?? '(loại không tồn tại)',
      required,
      attached:      attached.has(id),
    }
  }

  const required: ChecklistItem[]    = (op.required_doc_type_ids    ?? []).map((id: string) => mkItem(id, true))
  const recommended: ChecklistItem[] = (op.recommended_doc_type_ids ?? []).map((id: string) => mkItem(id, false))
  const attachedReq = required.filter((r) => r.attached).length

  return {
    operation_id:   op.id,
    operation_name: op.name,
    required,
    recommended,
    total_required:    required.length,
    attached_required: attachedReq,
    is_complete:    attachedReq === required.length,
  }
}
