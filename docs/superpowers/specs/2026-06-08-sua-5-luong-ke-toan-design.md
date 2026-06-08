# Sửa 5 lỗ hổng logic kế toán — 4 sheet nhập liệu

**Ngày:** 2026-06-08
**Bối cảnh:** Rà soát chuyên sâu luồng dữ liệu khi nhập ở Bảng kê bán ra / Bảng kê mua vào / Ngân hàng / Linh tinh (Chứng từ khác). Đã đọc code thật + test số liệu thật trên PGlite (37 migration), phát hiện 5 điểm cần sửa. Anh Thịnh đã chốt quyết định nghiệp vụ.

## Nguồn sự thật (đã đọc)

- 2 bảng kê là **view read-only**: `app/(app)/bang-ke-ban-ra/page.tsx`, `bang-ke-mua-vao/page.tsx` → `listSalesInvoices`/`listPurchaseInvoices` (`features/invoices/queries.ts`) đọc `customer_orders`/`supplier_orders`.
- Ngân hàng nhập trực tiếp: `BankCreateButtons` → `kbit_record_income` (thu), expense RPC (chi) → `income_transactions`/`expense_transactions`.
- Linh tinh: `chung-tu-khac/page.tsx` → `createCashEntry` (`features/cash-book/actions.ts`) → bảng `cash_book` (định nghĩa: `migrations/0016`, cột party `0024`).
- Báo cáo: `kbit_report_company` + `kbit_report_consolidated` (`migrations/0010_reports.sql`) — `total_income`/`total_expense` chỉ từ income/expense_transactions; `ar/ap_outstanding` chỉ từ orders.outstanding.
- Công nợ trang `/cong-no`: `getReceivableLedger`/`getPayableLedger` (`features/debts/queries.ts`) = orders **+ cash_book** gắn KH/NCC; công thức ở `features/debts/ledger.ts`.
- `customer_orders.outstanding` = generated `grand_total - amount_paid`; phiếu thu cộng `amount_paid` **chỉ khi phân bổ** (`migrations/0026`, `kbit_record_income`).

## Bằng chứng số thật (test-4luong.mjs, PGlite)

| KB | Kịch bản | Kết quả hiện tại (SAI) |
|---|---|---|
| 1 | HĐ xuất 05/03, đơn đặt 25/02 | Bảng kê xếp vào **tháng 2** (theo order_date), không vào tháng 3 |
| 2 | Thu tiền mặt 5tr ở Chứng từ khác | Tổng thu báo cáo = **0đ** |
| 3 | Đơn 10tr, trả 4tr qua Chứng từ khác | Báo cáo phải thu **10tr** ≠ Công nợ **6tr** |
| 4 | Trả 4tr ghi cả phiếu thu + chứng từ khác | Công nợ trừ 2 lần → còn **2tr** (đúng 6tr) |
| 5 | Thu đủ 10tr nhưng quên phân bổ | Công nợ ảo treo **10tr** |

## Quyết định nghiệp vụ (Anh Thịnh chốt)

- **A:** Bảng kê lọc kỳ theo **ngày hóa đơn**; đơn chưa có ngày HĐ → **ẩn**. Hiển thị **2 cột riêng**: Ngày HĐ + Ngày đơn.
- **C:** Giữ 2 đường thu/trả nợ — chuyển khoản ở Ngân hàng, tiền mặt ở Chứng từ khác — **+ cảnh báo** khi thu/trả vượt số nợ (chống ghi trùng).
- **E:** Tiền mặt linh tinh (cash_book) **phải vào** báo cáo dòng tiền.
- **F:** Giữ nguyên — "Tổng thu/chi" = tiền thực thu/chi (dòng tiền), không phải doanh thu/chi phí theo hóa đơn. KHÔNG sửa.

## Thiết kế 5 sửa đổi

### A — Bảng kê theo ngày hóa đơn (Đợt 1)
- `listSalesInvoices`/`listPurchaseInvoices`: đổi filter `order_date` → `invoice_date` (`.gte/.lte('invoice_date', ...)`). Đơn `invoice_date IS NULL` tự loại (NULL không thỏa so sánh) → khớp "ẩn đơn chưa HĐ".
- Row trả thêm `order_date` (đã có) để hiển thị; bỏ fallback `invoice_date ?? order_date` ở cột ngày HĐ (để trống nếu chưa có).
- 2 trang: tách cột "Ngày HĐ" và "Ngày đơn" riêng. Subtitle ghi rõ "lọc theo ngày hóa đơn".
- **Không sót dữ liệu:** đơn chưa xuất HĐ vẫn xem ở trang Đơn hàng/Nhập khẩu.

### B — Công nợ báo cáo khớp trang Công nợ (Đợt 2)
- `kbit_report_company`: `ar_outstanding` cộng thêm cash_book gắn customer_id trong phạm vi (`txn_date <= p_to`, cùng company): **thu → trừ**, **chi → cộng**. `ap_outstanding` đối xứng với supplier_id: **chi → trừ**, **thu → cộng**.
- `kbit_report_consolidated`: áp tương tự, quy ước cash_book là VND (không cần quy đổi).
- Khớp đúng quy ước `cashEntryToLedgerSource` (AR: thu giảm; AP: chi giảm).

### E — cash_book vào dòng tiền (Đợt 2, cùng RPC)
- `kbit_report_company` + `consolidated`: `total_income` += Σ cash_book(direction='thu', status='confirmed', cùng company, trong kỳ); `total_expense` += Σ cash_book(direction='chi', ...). `net_cash_flow` tự đổi theo.
- `createCashEntry`: lưu `status='confirmed'` (nhất quán phiếu thu/chi ngân hàng) để vào báo cáo ngay.
- **Lọc dự án:** cash_book không có project_id → chỉ cộng khi `p_project_id IS NULL` (xem toàn công ty). Khi lọc theo dự án, không tính tiền mặt linh tinh.

### C — Cảnh báo thu/trả vượt nợ (Đợt 3)
- Trang Công nợ: với mỗi đối tượng, nếu tổng đã thu/trả (settled) > tổng phát sinh (incurred + opening) → `closing < 0` → tô đỏ + nhãn "Thu vượt nợ — kiểm tra ghi trùng".
- Cảnh báo mềm (chỉ hiển thị), không chặn lưu (vì có thể là tiền cọc thật).

### D — Cảnh báo thu chưa phân bổ (Đợt 3)
- Mục "Thu cọc chưa gắn đơn" (`listUnassignedDeposits`) đã có. Thêm tín hiệu: nếu khách của phiếu cọc **đang có đơn nợ** (outstanding > 0) → nhãn "Có tiền chưa trừ vào đơn".
- Hiển thị nổi bật ở StatsCard / badge trang Công nợ.

## Chia đợt & kiểm thử

| Đợt | Mục | File chính | Test |
|---|---|---|---|
| 1 | A | `features/invoices/queries.ts` + 2 trang bảng kê | KB1: HĐ 05/03 vào kỳ tháng 3; đơn chưa HĐ ẩn |
| 2 | B + E | `migrations/00xx_*.sql` (RPC), `cash-book/actions.ts` | KB2: thu mặt → Tổng thu; KB3: 2 trang khớp 6tr |
| 3 | C + D | `features/debts/*` | KB4: cảnh báo đỏ; KB5: nhắc tiền chưa gắn |

**Mỗi đợt:** viết test PGlite trước (mở rộng `D:\tmp\kbit-local\test-4luong.mjs` thành bộ regression) → chạy xanh → `tsc` 0 lỗi → review độc lập (`requesting-code-review`) → commit. Migration mới đánh số tiếp 0040+.

**Ngoài phạm vi (YAGNI):** không làm sổ quỹ tiền mặt riêng, không làm P&L theo hóa đơn, không đổi cách phiếu thu phân bổ.
