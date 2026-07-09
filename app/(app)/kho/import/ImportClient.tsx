'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { PAGE_WRAPPER, LIST_WRAP, LIST_THEAD, LIST_ROW } from '@/lib/ui-tokens'
import { formatVND } from '@/lib/format'
import { parseInventoryExcel, commitInventoryImport } from '@/features/warehouse/import-actions'
import type { ImportRow, ParseResult, CommitResult } from '@/features/warehouse/import-actions'
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download } from 'lucide-react'

export function ImportInventoryClient() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null)
  const [error, setError] = useState('')

  function handleFile(f: File | null) {
    setFile(f)
    setResult(null)
    setCommitResult(null)
    setError('')
  }

  async function handleParse() {
    if (!file) return
    setParsing(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await parseInventoryExcel(fd)
      setResult(res)
    } catch (err: any) {
      setError(err.message ?? 'Lỗi khi đọc file')
    }
    setParsing(false)
  }

  async function handleCommit() {
    if (!result) return
    const okRows = result.rows.filter(r => r.status === 'ok')
    if (okRows.length === 0) return

    setCommitting(true)
    setError('')
    try {
      const res = await commitInventoryImport(okRows)
      setCommitResult(res)
    } catch (err: any) {
      setError(err.message ?? 'Lỗi khi import')
    }
    setCommitting(false)
  }

  function reset() {
    setFile(null)
    setResult(null)
    setCommitResult(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Import tồn kho đầu kỳ"
        subtitle="Upload file Excel mẫu để nhập hàng loạt số dư đầu kỳ (sản phẩm, lô, giá vốn)"
      />

      {/* Committed successfully */}
      {commitResult && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <CheckCircle2 className="size-5" />
            Import hoàn tất
          </div>
          <div className="text-sm text-green-800 space-y-1">
            <p>Đã xử lý thành công: <strong>{commitResult.processed}</strong> dòng</p>
            {commitResult.skipped > 0 && <p>Bỏ qua: <strong>{commitResult.skipped}</strong> dòng</p>}
          </div>
          {commitResult.errors.length > 0 && (
            <div className="text-sm text-red-700 space-y-1">
              <p className="font-medium">Lỗi:</p>
              {commitResult.errors.map((e, i) => (
                <p key={i}>Dòng {e.idx}: {e.msg}</p>
              ))}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button onClick={() => router.push('/kho/so-du-dau-ky')}>Xem Số dư đầu kỳ</Button>
            <Button variant="outline" onClick={reset}>Import file khác</Button>
          </div>
        </div>
      )}

      {/* Upload area */}
      {!commitResult && (
        <>
          <div
            className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary-50/40' : 'border-slate-300 bg-white'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] ?? null) }}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="size-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); reset() }}>Đổi file</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="size-10 mx-auto text-slate-400" />
                <p className="text-sm text-slate-500">Kéo thả file Excel vào đây hoặc <span className="text-primary font-medium cursor-pointer">chọn file</span></p>
                <p className="text-xs text-slate-400">Hỗ trợ .xlsx, .xls — theo mẫu đã tải</p>
              </div>
            )}
          </div>

          {file && !result && (
            <div className="flex gap-3">
              <Button onClick={handleParse} disabled={parsing}>
                {parsing ? 'Đang đọc file...' : 'Đọc & Kiểm tra dữ liệu'}
              </Button>
              <a
                href="/api/inventory-template"
                download
                className="inline-flex items-center h-9 px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium text-gray-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="size-4 mr-1.5" />
                Tải file mẫu
              </a>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Preview table */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-gray-700">Tổng: {result.summary.total} dòng</span>
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle2 className="size-4" /> {result.summary.ok} hợp lệ
                </span>
                {result.summary.error > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="size-4" /> {result.summary.error} lỗi
                  </span>
                )}
              </div>

              {/* Table */}
              <div className={`${LIST_WRAP} max-h-[60vh] overflow-auto`}>
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className={`${LIST_THEAD} sticky top-0 z-10`}>
                    <tr>
                      <th className="px-3 py-2.5 text-center w-10">#</th>
                      <th className="px-3 py-2.5 text-center w-10">TT</th>
                      <th className="px-3 py-2.5 text-left">Mã hàng</th>
                      <th className="px-3 py-2.5 text-left">Tên hàng</th>
                      <th className="px-3 py-2.5 text-left">Brand</th>
                      <th className="px-3 py-2.5 text-left">Nhà máy</th>
                      <th className="px-3 py-2.5 text-left">Lot</th>
                      <th className="px-3 py-2.5 text-left">Ngày SX</th>
                      <th className="px-3 py-2.5 text-left">HSD</th>
                      <th className="px-3 py-2.5 text-left">Kho</th>
                      <th className="px-3 py-2.5 text-left">Kỳ</th>
                      <th className="px-3 py-2.5 text-right">SL</th>
                      <th className="px-3 py-2.5 text-right">Giá SX</th>
                      <th className="px-3 py-2.5 text-right">Giá nhập</th>
                      <th className="px-3 py-2.5 text-right">Giá bán</th>
                      <th className="px-3 py-2.5 text-right">Giá NM</th>
                      <th className="px-3 py-2.5 text-right">Tiền vốn SX</th>
                      <th className="px-3 py-2.5 text-right">Thành tiền nhập</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map(row => (
                      <tr key={row.idx} className={`${LIST_ROW} ${row.status === 'error' ? '!bg-red-50' : ''}`}>
                        <td className="px-3 py-2 text-center text-gray-400">{row.idx}</td>
                        <td className="px-3 py-2 text-center">
                          {row.status === 'ok' ? (
                            <CheckCircle2 className="size-4 text-green-500 inline" />
                          ) : (
                            <span title={row.errors.join('\n')}>
                              <AlertTriangle className="size-4 text-red-500 inline" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.product_code}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{row.product_name}</td>
                        <td className="px-3 py-2">{row.brand}</td>
                        <td className="px-3 py-2">{row.manufacturer}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.lot_no}</td>
                        <td className="px-3 py-2 text-xs">{row.production_date}</td>
                        <td className="px-3 py-2 text-xs">{row.expiry_date}</td>
                        <td className="px-3 py-2">{row.warehouse_code}</td>
                        <td className="px-3 py-2">{row.period}</td>
                        <td className="px-3 py-2 text-right font-medium">{row.qty.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2 text-right">{row.cost_production > 0 ? `${row.cost_production.toLocaleString('vi-VN')} ${row.cost_production_curr}` : '-'}</td>
                        <td className="px-3 py-2 text-right">{row.cost_import > 0 ? formatVND(row.cost_import) : '-'}</td>
                        <td className="px-3 py-2 text-right">{row.price_brand > 0 ? formatVND(row.price_brand) : '-'}</td>
                        <td className="px-3 py-2 text-right">{row.price_list > 0 ? formatVND(row.price_list) : '-'}</td>
                        <td className="px-3 py-2 text-right">{row.cost_production > 0 ? `${(row.qty * row.cost_production).toLocaleString('vi-VN')} ${row.cost_production_curr}` : '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">{row.cost_import > 0 ? formatVND(row.qty * row.cost_import) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {result.rows.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-semibold text-sm">
                      <tr>
                        <td colSpan={11} className="px-3 py-2.5 text-right">TỔNG</td>
                        <td className="px-3 py-2.5 text-right">
                          {result.rows.filter(r => r.status === 'ok').reduce((s, r) => s + r.qty, 0).toLocaleString('vi-VN')}
                        </td>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-right">
                          {formatVND(result.rows.filter(r => r.status === 'ok').reduce((s, r) => s + r.qty * r.cost_import, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Error details */}
              {result.summary.error > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <p className="font-medium text-amber-800 mb-2">Chi tiết lỗi ({result.summary.error} dòng):</p>
                  <ul className="space-y-1 text-amber-700">
                    {result.rows.filter(r => r.status === 'error').map(r => (
                      <li key={r.idx}>
                        <strong>Dòng {r.idx}</strong> [{r.product_code}]: {r.errors.join('; ')}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-600">Các dòng lỗi sẽ bị bỏ qua khi import. Sửa file và upload lại nếu cần.</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleCommit}
                  disabled={committing || result.summary.ok === 0}
                >
                  {committing ? 'Đang import...' : `Import ${result.summary.ok} dòng hợp lệ`}
                </Button>
                <Button variant="outline" onClick={reset}>Hủy</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
