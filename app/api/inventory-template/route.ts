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

  const sampleRows = [
    [1, 'MK-001', 'Serum Vitamin C 30ml', 'Chai', 'MINT KOREA', 'Cosmax', 'L2026-001', '2026-03-15', '2028-03-15', 'KHO-KR', 'Kho Hàn Quốc', 'Mint Korea_KR', '2026-07', 500, 15000, 'KRW', 350000, 450000, 590000, '=N2*O2', '=N2*Q2'],
    [2, 'MK-002', 'Kem dưỡng da 50ml', 'Hộp', 'MINT KOREA', 'Kolmar', 'L2026-002', '2026-04-01', '2028-04-01', 'KHO-VN', 'Kho Việt Nam', 'KBIT_KR', '2026-07', 300, 22000, 'KRW', 520000, 650000, 850000, '=N3*O3', '=N3*Q3'],
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows])
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
