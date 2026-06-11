/**
 * Từ điển EN — map chuỗi tiếng Việt (đúng nguyên văn trong code) → tiếng Anh.
 * Chuỗi KHÔNG có trong map → UI hiện tiếng Việt (fallback an toàn).
 *
 * Quy ước: nhóm theo khu vực UI để dễ bảo trì. Key phải GIỐNG HỆT chuỗi trong code
 * (kể cả dấu —, …, ✓).
 */

export const EN: Record<string, string> = {
  // ── Sidebar: nhóm ──────────────────────────────────────────────
  'Tổng quan':  'Overview',
  'Giao dịch':  'Transactions',
  'Kho hàng':   'Inventory',
  'Kế toán':    'Accounting',
  'Tài chính':  'Finance',
  'Danh mục':   'Master Data',

  // ── Sidebar: mục ───────────────────────────────────────────────
  'Báo cáo':           'Reports',
  'Công nợ':           'Receivables & Payables',
  'Bảng kê bán ra':    'Sales Invoice List',
  'Bảng kê mua vào':   'Purchase Invoice List',
  'Sức khỏe':          'Financial Health',
  'Lãi gộp':           'Gross Profit',
  'Nhật ký bán ra':    'Sales Journal',
  'Nhật ký mua vào':   'Purchase Journal',
  'Ngân hàng':         'Bank',
  'Chứng từ khác':     'Other Vouchers',
  'Tồn kho':           'Stock on Hand',
  'Lịch sử':           'History',
  'Số dư đầu kỳ':      'Opening Balance',
  'Duyệt & Khóa kỳ':   'Approval & Period Lock',
  'Tài liệu đính kèm': 'Attachments',
  'Công việc':         'Tasks',
  'Loại chứng từ':     'Document Types',
  'Thư viện NV':       'Operation Library',
  'Kế hoạch thuế':     'Tax Plan',
  'Lịch thuế':         'Tax Calendar',
  'Công ty':           'Company',
  'Dự án':             'Projects',
  'Đối tác':           'Partners',
  'Mã hàng':           'Items',
  'Tài khoản NH':      'Bank Accounts',
  'Sản phẩm':          'Products',
  'Kho':               'Warehouses',
  'Tỷ giá':            'Exchange Rates',

  // ── Thanh lọc toàn cục + layout ────────────────────────────────
  'Đang xem':            'Viewing',
  '— Tất cả công ty —':  '— All companies —',
  'Năm':                 'Year',
  'Đang cập nhật…':      'Updating…',
  'Đăng xuất':           'Sign out',

  // ── Nút / nhãn chung ───────────────────────────────────────────
  'Xem':        'View',
  'Lọc':        'Filter',
  'Đặt lại':    'Reset',
  'Sửa':        'Edit',
  'Xóa':        'Delete',
  'Hủy':        'Cancel',
  'Huỷ':        'Cancel',
  'Lưu':        'Save',
  'Cập nhật':   'Update',
  'Tất cả':     'All',
  'Trạng thái': 'Status',
  'Ngày':       'Date',
  'Khách hàng': 'Customer',
  'Nhà cung cấp': 'Supplier',
  'Ghi chú':    'Notes',
  'Số tiền':    'Amount',
  'Đang lưu…':  'Saving…',
  'Đang xử lý...': 'Processing...',

  // ── Nhật ký bán ra (OrderList) ─────────────────────────────────
  '+ Tạo đơn hàng':        '+ New order',
  'Tạo đơn hàng bán ra':   'Create sales order',
  'Chưa có đơn hàng nào':  'No orders yet',
  'Bấm + Tạo đơn hàng để thêm đơn đầu tiên, hoặc import từ XML':
    'Click + New order to add your first order, or import from XML',
  'Mã đơn':       'Order code',
  'Tổng tiền':    'Total',
  'Còn lại':      'Outstanding',
  'Giao hàng':    'Fulfillment',
  'Thanh toán':   'Payment',
  'TỔNG CỘNG':    'TOTAL',
  'đơn / hóa đơn bán ra': 'orders / sales invoices',
  'đơn':          'orders',

  // ── Nhật ký mua vào (ImportOrderTable) ─────────────────────────
  'hóa đơn':                  'invoices',
  '+ Thêm hóa đơn mua vào':   '+ New purchase invoice',
  'Tạo hóa đơn mua vào (nhập khẩu / mua trong nước)':
    'Create purchase invoice (import / domestic)',
  'Chưa có hóa đơn mua vào nào': 'No purchase invoices yet',
  'NCC':            'Supplier',
  'Loại':           'Type',
  'Tiền':           'Currency',
  'Giá vốn lô':     'Lot cost',
  'Còn nợ NCC':     'Owed to supplier',
  'Nội bộ':         'Intercompany',
  'Trong nước':     'Domestic',
  'Nhập khẩu':      'Import',
  '✓ Đã thanh toán': '✓ Paid',

  // ── Trạng thái phổ biến ────────────────────────────────────────
  'Nháp':           'Draft',
  'Đã xác nhận':    'Confirmed',
  'Đã duyệt':       'Approved',
  'Đã giao':        'Delivered',
  'Chờ hàng':       'Awaiting goods',
  'Chưa thanh toán': 'Unpaid',
  'Một phần':       'Partial',
  'Đã thanh toán':  'Paid',
  'Đã nộp':         'Filed',
  'Quá hạn':        'Overdue',
  'Chờ nộp':        'Pending',
  'Đang mở':        'Open',
  'Đã khóa':        'Locked',
  'Đang chờ hàng':  'Awaiting goods',
  'Chưa trả':       'Unpaid',
  'Trả một phần':   'Partially paid',
  'Đã trả đủ':      'Paid in full',
}
