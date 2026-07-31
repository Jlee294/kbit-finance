'use server'

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canEdit, getCurrentUser } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { createClient } from '@/lib/supabase/server'
import { buildInvoiceKey } from './reconcile'
import {
  buildImportPreview,
  parseAccountingWorkbook,
  type ImportPreview,
  type ParsedAccountingFile,
} from './parser'

export interface ImportUploadState {
  error?: string
  message?: string
  batchId?: string
  preview?: ImportPreview
}

const metadataSchema = z.object({
  company_id: z.string().uuid('Chọn công ty'),
  period_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((data) => data.period_to >= data.period_from, {
  message: 'Ngày kết thúc phải từ ngày bắt đầu trở đi',
  path: ['period_to'],
})

const ALLOWED_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm', '.csv'])
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_FILES = 12

function extension(filename: string): string {
  const index = filename.lastIndexOf('.')
  return index >= 0 ? filename.slice(index).toLowerCase() : ''
}

function reconciliationKey(row: Record<string, unknown>): string | null {
  const invoiceNo = String(row.invoice_no ?? '').trim()
  const invoiceDate = String(
    row.posting_invoice_date
    ?? row.invoice_date
    ?? '',
  ).trim()
  if (invoiceNo && invoiceDate) return buildInvoiceKey({ invoiceNo, invoiceDate })
  const productCode = String(row.product_code ?? '').trim()
  if (productCode) return productCode
  const partnerCode = String(row.partner_code ?? '').trim()
  return partnerCode || null
}

async function parseFiles(files: File[]): Promise<ParsedAccountingFile[]> {
  const parsed: ParsedAccountingFile[] = []
  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.has(extension(file.name))) {
      throw new Error(`File ${file.name} không đúng định dạng Excel/CSV`)
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      throw new Error(`File ${file.name} rỗng hoặc lớn hơn 25 MB`)
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    parsed.push(parseAccountingWorkbook(bytes, file.name, sha256))
  }
  return parsed
}

async function persistStagingBatch(
  companyId: string,
  periodFrom: string,
  periodTo: string,
  files: ParsedAccountingFile[],
  preview: ImportPreview,
  userId: string,
): Promise<string> {
  const supabase = await createClient()
  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      company_id: companyId,
      period_from: periodFrom,
      period_to: periodTo,
      source_label: 'Bộ file kế toán do AI/admin tải lên',
      status: 'draft',
      total_files: files.length,
      total_rows: preview.totalRows,
      error_count: preview.errorCount,
      warning_count: preview.warningCount,
      created_by: userId,
    })
    .select('id')
    .single()
  if (batchError || !batch) throw new Error(batchError?.message ?? 'Không tạo được lô import')

  try {
    for (const file of files) {
      const { data: storedFile, error: fileError } = await supabase
        .from('import_files')
        .insert({
          batch_id: batch.id,
          kind: file.kind,
          filename: file.filename,
          sha256: file.sha256,
          sheet_name: file.sheetName,
          row_count: file.rows.length,
          parsed_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (fileError || !storedFile) throw new Error(fileError?.message ?? `Không lưu được ${file.filename}`)

      const stagingRows = file.rows.map((row) => ({
        batch_id: batch.id,
        file_id: storedFile.id,
        row_number: row.rowNumber,
        row_kind: file.kind,
        reconciliation_key: reconciliationKey(row.normalized),
        raw_data: row.raw,
        normalized_data: row.normalized,
        mapping_status: 'pending',
      }))
      for (let offset = 0; offset < stagingRows.length; offset += 500) {
        const { error: rowsError } = await supabase
          .from('import_staging_rows')
          .insert(stagingRows.slice(offset, offset + 500))
        if (rowsError) throw new Error(rowsError.message)
      }
    }

    const checkRows = preview.checks.map((item) => ({
      batch_id: batch.id,
      check_code: item.code,
      status: item.status === 'warning' ? 'explained' : item.status,
      expected_value: item.expected,
      actual_value: item.actual,
      source_ref: item.label,
      explanation: item.explanation ?? null,
    }))
    for (let offset = 0; offset < checkRows.length; offset += 500) {
      const { error: checksError } = await supabase
        .from('import_checks')
        .insert(checkRows.slice(offset, offset + 500))
      if (checksError) throw new Error(checksError.message)
    }

    const status = preview.readyToApprove ? 'validated' : 'needs_review'
    const { error: updateError } = await supabase
      .from('import_batches')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', batch.id)
    if (updateError) throw new Error(updateError.message)
    return batch.id
  } catch (error) {
    await supabase.from('import_batches').delete().eq('id', batch.id)
    throw error
  }
}

export async function previewAndStageAccountingFiles(
  _previousState: ImportUploadState,
  formData: FormData,
): Promise<ImportUploadState> {
  try {
    const metadata = metadataSchema.parse({
      company_id: formData.get('company_id'),
      period_from: formData.get('period_from'),
      period_to: formData.get('period_to'),
    })
    const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0)
    if (files.length === 0) throw new Error('Chọn bộ file Excel cần kiểm tra')
    if (files.length > MAX_FILES) throw new Error(`Mỗi lô tối đa ${MAX_FILES} file`)

    const parsedFiles = await parseFiles(files)
    const preview = buildImportPreview(parsedFiles)

    if (isDemoMode()) {
      return {
        preview,
        message: preview.readyToApprove
          ? 'Đã đọc và cân toàn bộ file. Chế độ local chỉ xem trước, chưa ghi dữ liệu vào cơ sở dữ liệu.'
          : 'Đã đọc file nhưng còn chênh lệch. Xem các dòng màu đỏ trước khi bàn giao.',
      }
    }

    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) throw new Error('Không có quyền tạo lô import')
    const batchId = await persistStagingBatch(
      metadata.company_id,
      metadata.period_from,
      metadata.period_to,
      parsedFiles,
      preview,
      me.id,
    )
    return {
      preview,
      batchId,
      message: preview.readyToApprove
        ? 'Lô dữ liệu đã cân 100% và chuyển sang trạng thái chờ duyệt.'
        : 'Lô đã được lưu ở vùng chờ nhưng bị khóa do còn chênh lệch.',
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Không đọc được bộ file' }
  }
}
