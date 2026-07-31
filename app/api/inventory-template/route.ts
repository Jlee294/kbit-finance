import * as XLSX from 'xlsx'
import { NextResponse } from 'next/server'

export async function GET() {
  const headers = [
    'STT',
    'Mã hàng',
    'Tên hàng',
    'Đơn vị',
    'Thương hiệu (brand)',
    'Nhà máy SX',
    'Lot No',
    'Ngày SX',
    'HSD (hạn sử dụng)',
    'Mã kho',
    'Tên kho',
    'Công ty thanh toán',
    'Kỳ (YYYY-MM)',
    'Số lượng',
    'Giá SX (chất + bao bì)',
    'Đơn vị tiền giá SX',
    'Giá nhập (theo tờ khai NK)',
    'Giá bán cho NCC/brand',
    'Giá niêm yết',
    'Tiền vốn SX',
    'Thành tiền nhập',
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers])
  ws['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 18 },
    { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 20 },
    { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 16 },
    { wch: 16 },
  ]

  const guideData = [
    ['HƯỚNG DẪN NHẬP TỒN KHO ĐẦU KỲ'],
    [''],
    ['CỘT', 'MÔ TẢ', 'BẮT BUỘC', 'GHI CHÚ'],
    ['Mã hàng', 'Mã sản phẩm trên hệ thống', 'Có', 'Phải khớp Danh mục → Mã hàng'],
    ['Tên hàng', 'Tên sản phẩm (tham chiếu)', 'Không', ''],
    ['Thương hiệu', 'Brand', 'Không', 'Khớp brand trên hệ thống'],
    ['Nhà máy SX', 'Nhà máy sản xuất', 'Không', 'Sẽ cập nhật vào sản phẩm'],
    ['Lot No', 'Số lô sản xuất', 'Không', 'Mã lô từ nhà máy'],
    ['Ngày SX / HSD', 'Định dạng YYYY-MM-DD', 'Không', ''],
    ['Mã kho', 'Mã kho nhập tồn', 'Có', 'Khớp Danh mục → Kho'],
    ['Công ty', 'Công ty đặt hàng', 'Không', 'Tên công ty trên hệ thống'],
    ['Kỳ', 'YYYY-MM', 'Có', 'VD: 2026-07'],
    ['Số lượng', 'SL tồn kho', 'Có', '> 0'],
    ['Giá SX', 'Giá chất + bao bì', 'Không', 'KRW/VND/USD — cập nhật sau qua Nhà máy'],
    ['Giá nhập (tờ khai)', 'Giá sau phân bổ phí VC+thuế (VND)', 'Không', 'Dùng làm đơn giá vốn, bỏ trống = 0'],
    ['Giá bán NCC', 'Giá bán sỉ (VND)', 'Không', 'Cập nhật sau qua Brand'],
    ['Giá niêm yết', 'Giá bán lẻ (VND)', 'Không', 'Cập nhật sau qua Brand'],
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 10 }, { wch: 50 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tồn kho đầu kỳ')
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Hướng dẫn')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="mau_nhap_ton_kho_dau_ky.xlsx"',
    },
  })
}
