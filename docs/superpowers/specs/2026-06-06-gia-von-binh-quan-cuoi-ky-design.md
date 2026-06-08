# Thiết kế: Giá vốn bình quân gia quyền cuối kỳ + Lãi gộp

> Ngày: 2026-06-06 · Trạng thái: ĐÃ DUYỆT thiết kế (anh Thịnh) · Bước sau: lập plan
> Phạm vi đợt này: **chỉ Giá vốn + Lãi gộp**. VAT 4 chỉ tiêu và Phân loại thu/chi mẹ–con là 2 đợt riêng sau.

## 1. Bối cảnh & Mục tiêu

kbit là **công cụ quản trị nội bộ** (không thay sổ kế toán pháp định). Hiện kbit theo dõi kho **chỉ bằng số lượng** (`warehouse_stock.qty_on_hand`), giá vốn nhập (`supplier_order_items.unit_cost`) **không chảy vào kho**, khi bán **chỉ trừ số lượng, không kết chuyển giá vốn** → **không biết lãi gộp**.

Mục tiêu: theo dõi **tồn kho theo giá trị** + tính **giá vốn xuất theo bình quân gia quyền cuối kỳ (tháng)** → ra **lãi gộp** (doanh thu − giá vốn).

## 2. Quyết định nghiệp vụ đã chốt

1. **Phạm vi bình quân: gộp theo MÃ HÀNG** — 1 đơn giá BQ / mã / tháng, gộp mọi kho. (Kho trong kbit toàn cục, không gắn công ty; luân chuyển kho không đổi giá vốn.)
2. **Thời điểm: chốt 1 lần cuối tháng** — trong tháng phiếu xuất để "giá vốn chưa chốt"; bấm **"Chốt giá vốn"** cuối tháng mới tính BQ + gán giá vốn + ra lãi gộp. Số liệu đông cứng sau chốt.
3. **Số dư đầu kỳ: nhập tay** — kế toán khai SL tồn + đơn giá vốn đầu cho từng mã, 1 lần khi bắt đầu áp dụng.
4. **Lãi gộp xem ở 3 mức:** tổng theo tháng · theo từng mã hàng · theo từng đơn bán.

## 3. Mô hình dữ liệu (chỉ THÊM mới — không sửa bảng cũ)

### 3.1. Bảng mới `inventory_cost_periods` — "thẻ giá vốn tháng"
1 dòng / (mã hàng × tháng). Gộp toàn bộ kho.

| Cột | Ý nghĩa |
|---|---|
| `product_id` | mã hàng |
| `period` (text 'YYYY-MM') | tháng |
| `qty_open`, `value_open` | tồn đầu kỳ: số lượng & giá trị |
| `qty_in`, `value_in` | nhập trong kỳ: SL & giá trị (Σ qty×đơn giá nhập) |
| `qty_out`, `value_out` | xuất trong kỳ: SL & giá trị (= qty_out × avg_unit_cost) |
| `avg_unit_cost` | **đơn giá BQ tháng** = (value_open+value_in)/(qty_open+qty_in) |
| `qty_close`, `value_close` | tồn cuối = đầu + nhập − xuất |
| `status` ('open'/'closed'), `closed_at`, `closed_by` | trạng thái chốt |

Khóa duy nhất `(product_id, period)`.

### 3.2. Thêm cột vào bảng đang chạy (nullable — an toàn)
- `warehouse_transactions.unit_cost numeric(18,2)` — **đơn giá vốn mỗi lần phát sinh**. Nhập: ghi ngay (từ đơn mua hoặc gõ tay). Xuất: để trống, gán = `avg_unit_cost` khi chốt.
- `customer_order_items.cost_price numeric(18,2)` — **giá vốn/đv dòng bán**, gán khi chốt → phục vụ lãi gộp theo đơn.

### 3.3. Số dư đầu kỳ
Một màn hình "Số dư đầu kỳ kho": nhập (mã hàng, SL tồn, đơn giá vốn) cho **tháng mốc** → ghi `qty_open`/`value_open` của thẻ tháng đó. Chỉ làm 1 lần khi khởi động.

## 4. Luồng vận hành

1. **Khởi tạo (1 lần):** nhập tay số dư đầu kỳ → thẻ tháng mốc có `qty_open`, `value_open`.
2. **Trong tháng — nhập kho:** mỗi phiếu nhập ghi `unit_cost`:
   - Nhập từ **đơn mua** (`createImportOrder` + warehouse): tự lấy `unit_cost` từ `supplier_order_items` (đã phân bổ chi phí nhập).
   - Nhập **thủ công** (`receiveStock`): **bắt buộc gõ đơn giá vốn**.
3. **Trong tháng — xuất kho:** phiếu xuất (bán/hỏng/mẫu) chỉ ghi số lượng, `unit_cost` để trống ("chưa chốt").
4. **Cuối tháng — bấm "Chốt giá vốn"** (RPC `kbit_close_inventory_cost(period)`):
   - Với mỗi mã: tính `avg_unit_cost`, tổng nhập/xuất, tồn cuối → ghi thẻ; `status='closed'`.
   - Gán `unit_cost = avg` cho mọi phiếu xuất trong tháng (`warehouse_transactions`).
   - Gán `cost_price = avg` cho dòng `customer_order_items` của đơn bán xuất trong tháng → ra lãi gộp.
   - Tạo thẻ tháng kế tiếp với `qty_open`/`value_open` = tồn cuối tháng này (gối đầu tự động).
5. **Liên kết khóa kỳ:** khuyến nghị **chốt giá vốn trước khi khóa kỳ tháng** (chi tiết ràng buộc để bước plan quyết).

## 5. Công thức + ví dụ (1 mã / 1 tháng)

`avg_unit_cost = (value_open + value_in) / (qty_open + qty_in)`
`value_out = qty_out × avg_unit_cost` · `value_close = value_open + value_in − value_out`

| | SL | Giá trị |
|---|--|--|
| Tồn đầu | 100 | 1.000 (10/c) |
| Nhập | 50 | 800 (16/c) |
| **Đơn giá BQ** | | **1.800/150 = 12/c** |
| Xuất bán 120 | 120 | **1.440** |
| Tồn cuối | 30 | 360 |

Doanh thu bán 120 = 2.000 ⟹ **lãi gộp = 2.000 − 1.440 = 560**.

## 6. Báo cáo lãi gộp (3 mức)
Nguồn: `customer_order_items` (`unit_price` − `cost_price`) × `qty`, lọc theo kỳ đã chốt.
- **Theo đơn bán:** lãi gộp từng đơn.
- **Theo mã hàng:** gộp theo `product_id`.
- **Tổng tháng:** Σ doanh thu bán − Σ giá vốn hàng bán.
Cảnh báo "kỳ chưa chốt → lãi gộp chưa có" để không hiểu nhầm.

## 7. Xử lý ngoại lệ
- **Nhập kho thủ công:** bắt buộc nhập đơn giá vốn (không có nguồn khác).
- **Xuất hỏng/mẫu** (`issue` reason damage/sample): vẫn trừ giá vốn theo BQ (vào value_out) nhưng **KHÔNG** tính vào lãi gộp bán — tách thành "hao hụt / giá vốn khác".
- **Luân chuyển kho** (transfer_out/in): **bỏ qua** khi tính BQ (gộp theo mã toàn cục → tổng tồn mã không đổi).
- **Tồn âm** (kbit cho phép, mig 0027): vẫn tính theo `avg_unit_cost`; tồn cuối có thể âm về giá trị → **cảnh báo**, không chặn.
- **Điều chỉnh tồn** (`adjustment`): tăng → cần đơn giá (như nhập); giảm → theo BQ (như xuất).
- **Đơn bán KHÔNG chọn kho** (không trừ kho): không gắn giá vốn → **không tính lãi gộp** (coi là dịch vụ / không quản giá vốn). Báo cáo lãi gộp hàng hóa loại các đơn này ra.
- **"Xuất bán"** để tính lãi gộp = phiếu `order_deduction` (xuất theo đơn bán có ref_order_id). Khớp giá vốn về dòng `customer_order_items` theo `product_id`.

## 8. An toàn & tương thích
- Chỉ **thêm** 1 bảng + 2 cột nullable; **không sửa** logic kho/bán hiện tại.
- Tính năng chạy **song song**: nếu chưa chốt/chưa nhập số dư đầu → kho vẫn hoạt động như cũ (chỉ thiếu lãi gộp), không vỡ luồng đang chạy.
- Migration mới (đánh số tiếp theo), idempotent.

## 9. Kiểm chứng (test)
- Hàm thuần tính BQ + value_out + value_close: unit test theo ví dụ mục 5 (và ca tồn âm, nhập 0).
- Chốt kỳ: gán đúng `unit_cost`/`cost_price`; thẻ tháng sau gối đầu đúng tồn cuối.
- Lãi gộp 3 mức khớp tay trên bộ dữ liệu mẫu.
- Regression: build xanh + test cũ pass + chạy thử app (nhập–xuất–chốt–xem lãi gộp).

## 10. Ngoài phạm vi đợt này
- VAT 4 chỉ tiêu (đầu vào/ra/đầu kỳ/dự kiến nộp) — đợt riêng.
- Phân loại thu/chi mẹ–con + báo cáo cơ cấu — đợt riêng.
