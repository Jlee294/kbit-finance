import type { OperationChecklistResult } from '../checklist'

/**
 * KTT D3: hiển thị danh sách chứng từ cần có cho 1 entity theo nghiệp vụ.
 * - Tick xanh = đã đính kèm
 * - Chấm đỏ = thiếu (required)
 * - Chấm xám = thiếu (recommended)
 * - Banner cảnh báo khi chưa đủ required
 *
 * Server component — chỉ render markup, không có state.
 */

interface Props {
  result: OperationChecklistResult
}

export function DocumentChecklist({ result }: Props) {
  if (!result.operation_id) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        Chưa chọn nghiệp vụ — chưa có checklist chứng từ. Chọn nghiệp vụ ở form đơn để app tự liệt kê chứng từ cần có.
      </div>
    )
  }

  const hasAny = result.required.length + result.recommended.length > 0
  if (!hasAny) {
    return (
      <div className="rounded-md border border-brand-100 bg-brand-50/30 px-3 py-2 text-xs text-brand-800">
        Nghiệp vụ <strong>{result.operation_name}</strong> chưa khai báo chứng từ bắt buộc.
        Vào <span className="underline">Thư viện NV</span> để thêm danh sách chứng từ cần có.
      </div>
    )
  }

  const missing = result.total_required - result.attached_required

  return (
    <div className="rounded-md border border-brand-100 bg-white px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-brand-800">
          📋 Checklist chứng từ — {result.operation_name}
        </p>
        {result.is_complete ? (
          <span className="text-xs font-semibold bg-success-50 text-success-700 px-2 py-0.5 rounded-full">✓ Đủ HS</span>
        ) : (
          <span className="text-xs font-semibold bg-warning-50 text-warning-700 px-2 py-0.5 rounded-full">⚠ Thiếu {missing}/{result.total_required}</span>
        )}
      </div>

      {result.required.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Bắt buộc</p>
          <ul className="space-y-1">
            {result.required.map((it) => (
              <li key={it.doc_type_id} className="flex items-center gap-2 text-sm">
                {it.attached ? (
                  <span className="text-success-700">✓</span>
                ) : (
                  <span className="text-danger-700">●</span>
                )}
                <span className={it.attached ? 'text-gray-700 line-through decoration-success-700/40' : 'text-gray-900 font-medium'}>
                  {it.doc_type_name}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">[{it.doc_type_code}]</span>
                {!it.attached && (
                  <span className="ml-auto text-[10px] text-danger-700 font-medium">Thiếu</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.recommended.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Nên có (không bắt buộc)</p>
          <ul className="space-y-1">
            {result.recommended.map((it) => (
              <li key={it.doc_type_id} className="flex items-center gap-2 text-sm">
                {it.attached ? (
                  <span className="text-success-700">✓</span>
                ) : (
                  <span className="text-gray-400">○</span>
                )}
                <span className={it.attached ? 'text-gray-700' : 'text-gray-500'}>
                  {it.doc_type_name}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">[{it.doc_type_code}]</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-gray-500 pt-1 border-t">
        💡 Upload chứng từ ở tab <strong>Tài liệu đính kèm</strong> của đơn này — chọn đúng loại chứng từ để app tự tick xanh.
      </p>
    </div>
  )
}
