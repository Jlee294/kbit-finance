# Thiết kế: Giá vốn bình quân LIÊN HOÀN + Bảng Nhập-Xuất-Tồn + Gộp giao diện kho

- **Ngày:** 2026-06-06
- **Người yêu cầu:** Anh Thịnh (KTT, non-technical về code; rành nghiệp vụ kế toán/thuế)
- **Trạng thái:** Chờ duyệt spec → writing-plans (Giai đoạn 1)
- **Spec liên quan (sẽ bị thay phương pháp):** `2026-06-06-gia-von-binh-quan-cuoi-ky-design.md` (migration 0028 — BQ cuối kỳ)

---

## 1. Bối cảnh & Mục tiêu (nguyên văn yêu cầu)

> "Tại bảng Nhập xuất tồn kho theo mẫu anh gửi (ảnh). 3 tab Nhập kho, xuất kho, luân chuyển nên bỏ đi, để nó chỉ là 1 biểu tượng trong Tồn kho đã có rồi, tại tồn kho, người dùng click vào nút Nhập/Xuất để tạo ra đơn nhập xuất. Ko cần tạo tab riêng."

Ảnh mẫu: bảng NXT chuẩn kế toán — mỗi mã hàng 1 dòng, cụm cột **Tồn đầu kỳ / Nhập trong kỳ / Xuất trong kỳ / Tồn cuối kỳ**, mỗi cụm có **Số lượng + Thành tiền**, thêm cột **Giá (đơn giá vốn)**.

### Quyết định đã chốt với Anh Thịnh (qua hỏi-đáp)

| # | Quyết định | Giá trị |
|---|---|---|
| Q1 | Luân chuyển khi bỏ tab | **Gộp chung 1 popup, có ô chọn loại** (Nhập / Xuất / Luân chuyển) |
| Q2 | Phạm vi bảng | **Dựng bảng NXT đầy đủ theo mẫu ảnh** (theo kỳ, có Thành tiền) |
| Q3 | Vị trí nút | **Nút chung đầu trang** Tồn kho, bấm mở popup |
| Q4 | Phương pháp giá vốn | **Bình quân gia quyền LIÊN HOÀN** (moving average), thay cho BQ cuối kỳ |
| Q5 | Phạm vi đổi phương pháp | **Toàn hệ thống** (nhập, xuất, giá vốn đơn bán, lãi gộp, bảng NXT) — 1 con số nhất quán |
| Q6 | Dữ liệu cũ | **Chưa dùng thật** → thay thẳng, không phải giữ lịch sử kỳ cũ |
| Q7 | Đơn giá vốn tính theo | **Mã hàng** (gộp mọi kho) — 1 đơn giá/mã |
| Q8 | Quản lý & lọc | **Theo kho** (số lượng quản lý theo từng kho, bảng NXT lọc được theo kho) |
| Q9 | Trang "Giá vốn & chốt kỳ" | **Gộp nút Chốt vào trang Tồn kho**, bỏ menu riêng |
| Q10 | Số dư đầu kỳ | **Khai theo từng kho** (mã + kho + số lượng + đơn giá vốn) |
| Q11 | Triển khai | **Tuần tự, có chốt chặn** — làm Giai đoạn 1 trước, anh nghiệm thu rồi mới qua 2, 3 |

---

## 2. Hiện trạng (nguồn sự thật đã đọc)

- **3 kho thật:** `KHO-VN` (Kho VN), `KHO-KR` (Kho KR), `KHO-BB` (Kho Bao bì) — `0012_warehouses.sql:34-38`.
- **`warehouse_stock(warehouse_id, product_id, qty_on_hand)`** — tồn theo (kho, mã), KHÔNG có cột giá. Constraint không-âm đã bị bỏ bởi `0027` (cho phép kho âm).
- **`warehouse_transactions`** — sổ cái append-only. Cột: `txn_date, txn_type, warehouse_id, product_id, qty(>0), reason, note, ref_order_id, ref_transfer_id, to_warehouse_id, unit_cost (thêm 0028), created_by`. Enum `warehouse_txn_type`: `receipt | issue | transfer_out | transfer_in | order_deduction | adjustment`.
- **Giá vốn hiện tại = BQ CUỐI KỲ:** `kbit_close_inventory_cost(period)` tính 1 lần/tháng/mã, gộp mọi kho. Trước khi chốt: `unit_cost` phiếu xuất & `cost_price` dòng bán = NULL.
- **`inventory_cost_periods`** (theo mã + period): qty/value open-in-out-close + avg_unit_cost + status. Là nơi lưu giá trị tồn.
- **Số dư đầu kỳ hiện tại:** `kbit_set_opening_stock(product_id, period, qty, unit_cost)` chỉ ghi `inventory_cost_periods` (theo MÃ), **KHÔNG đụng `warehouse_stock`, KHÔNG theo kho**.
- **Lãi gộp:** `summarizeGrossProfit()` (hàm thuần, `avg-cost.ts`) đọc `customer_order_items.cost_price` — chỉ có sau khi chốt kỳ.
- **KHÔNG có** cột/bảng nào lưu giá BQ liên hoàn hiện hành. `adjustment` có enum nhưng `kbit_adjust_stock` chỉ đổi `qty`, không ghi sổ.

### Vấn đề cốt lõi phát hiện
**Hai sổ "tồn đầu kỳ" tách rời:** tồn thực tế (`warehouse_stock`, theo kho) và tồn-đầu-kỳ-giá-vốn (`inventory_cost_periods`, theo mã) độc lập nhau → dễ lệch. Thiết kế mới **hợp nhất**: sổ cái `warehouse_transactions` là **nguồn sự thật duy nhất** (gồm cả số dư đầu kỳ); mọi tồn & giá trị suy ra từ sổ.

---

## 3. Kiến trúc tổng — 3 giai đoạn

```
Giai đoạn 1 (NỀN):  Giá vốn bình quân liên hoàn
  - Sổ cái warehouse_transactions = nguồn duy nhất (thêm txn_type 'opening')
  - Bảng cache product_moving_cost (qty tổng + avg hiện hành theo mã)
  - Sửa RPC: receive/issue/transfer/deduct_order/adjust/set_opening ghi & dùng avg liên hoàn
  - Lãi gộp realtime (cost_price gán ngay khi bán)
  - Chốt kỳ = KHÓA SỔ (snapshot + lock), không còn tính giá
  - Test: công thức liên hoàn + tồn âm + biên

Giai đoạn 2 (BẢNG):  Bảng NXT theo tháng trên trang Tồn kho
  - Query mới: NXT theo (kỳ, [kho]) suy từ sổ cái — đầu/nhập/xuất/cuối, SL + Thành tiền
  - Chọn tháng + lọc theo kho
  - Đọc snapshot nếu kỳ đã khóa, tính live nếu kỳ đang mở

Giai đoạn 3 (UI GỘP):  Gộp giao diện
  - Bỏ menu Nhập/Xuất/Luân chuyển; nút đầu trang Tồn kho mở popup (StockMutationForm trong Dialog)
  - Đưa nút "Chốt kỳ / Khóa sổ" vào trang Tồn kho; bỏ menu "Giá vốn & chốt kỳ" riêng
  - Số dư đầu kỳ: form khai theo từng kho
```

**Nguyên tắc xuyên suốt:** đơn giá vốn BQ tính **theo MÃ** (gộp mọi kho); số lượng quản lý **theo KHO**. Thành tiền theo kho = SL kho × đơn giá BQ của mã.

---

## 4. GIAI ĐOẠN 1 — Nền giá vốn bình quân liên hoàn (chi tiết)

### 4.1. Mô hình dữ liệu

**Migration mới `0029_moving_average_cost.sql`** (chỉ thêm/sửa, chưa có data thật nên an toàn):

**(a) Thêm enum value `opening`** vào `warehouse_txn_type` (số dư đầu kỳ là một loại giao dịch).

```sql
alter type warehouse_txn_type add value if not exists 'opening';
```

**(b) Bảng cache giá vốn liên hoàn hiện hành (theo MÃ):**

```sql
create table if not exists product_moving_cost (
  product_id  uuid primary key references products(id),
  qty_on_hand numeric(18,3) not null default 0,   -- tổng tồn MỌI kho của mã (để tính BQ)
  avg_cost    numeric(18,2) not null default 0,    -- đơn giá BQ liên hoàn HIỆN HÀNH
  updated_at  timestamptz not null default now()
);
```

- `qty_on_hand` ở đây = Σ `warehouse_stock.qty_on_hand` của mã (mọi kho). Lưu sẵn để RPC tính BQ nhanh (cần qty-trước-giao-dịch).
- Đây là **cache trạng thái hiện tại**, không theo kỳ. Có thể dựng lại bất kỳ lúc nào bằng cách replay sổ cái (viết 1 hàm `kbit_rebuild_moving_cost()` để chữa lệch nếu cần — tùy chọn).

**(c) `inventory_cost_periods`** giữ nguyên cấu trúc, nhưng **đổi vai trò**: từ "nơi tính giá" → "snapshot khi khóa kỳ" (báo cáo nhanh + khóa số). Không còn là nguồn tính giá vốn.

### 4.2. Công thức bình quân liên hoàn (chuẩn hóa, sẽ viết thành hàm thuần để test)

Trạng thái trước giao dịch: `qty0`, `avg0` (theo mã, từ `product_moving_cost`).

**NHẬP** số lượng `q`, đơn giá lô `u` (nếu để trống → `u = avg0`):
```
qty1 = qty0 + q
avg1 = (qty0 > 0)  ? round2( (qty0*avg0 + q*u) / qty1 )   -- bình quân lại
                   : u                                      -- tồn ≤ 0: lấy giá lô mới
unit_cost ghi sổ (dòng receipt) = u
```

**XUẤT** (issue / order_deduction / transfer_out) số lượng `q`:
```
unit_cost ghi sổ = avg0           -- giá vốn xuất tại thời điểm
qty1 = qty0 - q                   -- avg KHÔNG đổi khi xuất
avg1 = avg0
```
(Cho phép kho âm: nếu `qty1 ≤ 0`, `avg1` giữ `avg0`; lần nhập sau sẽ tự lấy giá lô mới do nhánh `qty0 ≤ 0`.)

**LUÂN CHUYỂN** A→B số lượng `q`: tổng tồn mã KHÔNG đổi ⇒ `product_moving_cost` KHÔNG đổi. Ghi 2 dòng sổ `transfer_out` (kho A) & `transfer_in` (kho B), cả hai `unit_cost = avg0` (để báo cáo theo kho khớp giá trị). Chỉ `warehouse_stock` hai kho đổi.

**SỐ DƯ ĐẦU KỲ** (mã + kho) số lượng `q`, đơn giá `u`: ghi/sửa 1 dòng sổ `opening` tại ngày `period-01`; đặt `warehouse_stock(kho,mã)=q`; cập nhật `product_moving_cost` của mã bằng công thức NHẬP (cộng dồn qua các kho cùng mã; vì cùng đơn giá mã nên `avg = u`).

### 4.2.bis BẤT BIẾN: KHÔNG chênh lệch (ràng buộc Anh Thịnh chốt 2026-06-06)

Một phương pháp DUY NHẤT (liên hoàn) chạy xuyên suốt đầu kỳ → cuối kỳ. Cuối kỳ KHÔNG có phép tính thứ hai (tuyệt đối không tính lại theo kiểu "tổng tiền nhập cả kỳ ÷ tổng SL cả kỳ" — đó là phương pháp BQ cuối kỳ khác hẳn, sẽ lệch khi giá biến động). Hệ quả phải đúng:

1. **Giá vốn xuất cộng dồn === giá vốn xuất khi khóa sổ:** `value_out (snapshot) = Σ (qty × unit_cost)` của các dòng xuất trong kỳ — lấy thẳng từ sổ, KHÔNG nhân lại `qty_out × avg`.
2. **Bảo toàn giá trị tuyệt đối:** `value_close = value_open + Σvalue_in − Σvalue_out` (cộng dồn theo sổ). KHÔNG tính `value_close = qty_close × avg` (phép này lệch vài đồng do làm tròn). Luôn giữ đẳng thức **`value_open + value_in = value_out + value_close`**.
3. `avg_unit_cost` cuối kỳ chỉ để HIỂN THỊ (`= value_close / qty_close` khi `qty_close > 0`), không dùng để tính ngược ra giá trị.
4. **Giá vốn đơn bán === giá vốn xuất kho tương ứng:** `customer_order_items.cost_price` của một lần bán = `warehouse_transactions.unit_cost` của dòng `order_deduction` sinh ra từ chính lần bán đó (cùng `avg` tại thời điểm trừ kho).

Lưu ý: con số liên hoàn này KHÁC với "BQ cả kỳ (tổng nhập ÷ tổng SL)" khi giá nhập trong kỳ biến động — đây là bản chất hai phương pháp, KHÔNG phải lỗi. App chỉ dùng liên hoàn nên nội bộ luôn nhất quán.

### 4.3. Sửa các RPC (before → after)

| RPC | Thay đổi |
|---|---|
| `kbit_receive_stock` | Đọc `(qty0,avg0)` từ `product_moving_cost`; chuẩn hóa `u = coalesce(p_unit_cost, avg0)`; tính `avg1` (công thức NHẬP); upsert `product_moving_cost`; cộng `warehouse_stock`; ghi sổ `receipt` với `unit_cost = u`. |
| `kbit_issue_stock` | Đọc `avg0`; ghi sổ `issue` với `unit_cost = avg0`; trừ `warehouse_stock`; `product_moving_cost.qty_on_hand -= q` (avg giữ). |
| `kbit_deduct_order_item` | Như issue (loại `order_deduction`, `unit_cost = avg0`). **Thêm:** `update customer_order_items set cost_price = avg0 where order_id=? and product_id=? and cost_price is null` → **lãi gộp realtime**. |
| `kbit_transfer_stock_full` | Giữ logic chuyển kho; ghi `unit_cost = avg0` cho cả `transfer_out` & `transfer_in`; KHÔNG đụng `product_moving_cost`. |
| `kbit_adjust_stock` | Đồng bộ `product_moving_cost.qty_on_hand += p_delta` (avg giữ); ghi 1 dòng sổ `adjustment` (qty = |delta|, có hướng qua dấu — cần quy ước cột; xem Mở ngỏ). |
| `kbit_set_opening_stock` | **Đổi chữ ký:** thêm `p_warehouse_id`. Xóa dòng `opening` cũ của (mã,kho,period) nếu kỳ chưa khóa; ghi dòng `opening` mới (ngày `period-01`, `unit_cost=u`); đặt `warehouse_stock(kho,mã)=q`; cập nhật `product_moving_cost`. |
| `kbit_close_inventory_cost` | **Đổi vai trò → KHÓA SỔ:** tổng hợp số liệu kỳ (đầu/nhập/xuất/cuối, SL+giá trị) từ sổ cái vào `inventory_cost_periods` làm snapshot; `avg_unit_cost = avg cuối kỳ` (từ sổ); set `status='closed'`. **KHÔNG tính lại** `unit_cost`/`cost_price` (đã có realtime). Bỏ cơ chế "gối đầu" (tồn đầu kỳ sau giờ suy từ sổ). |

### 4.4. Lãi gộp realtime

- `cost_price` gán ngay khi `order_deduction` (mục trên) → `queries.grossProfit()` & `summarizeGrossProfit()` **giữ nguyên**, nhưng số liệu có **ngay**, không chờ chốt.
- `computePeriodCost()` (BQ cuối kỳ) **không còn là đường tính chính**. Đánh dấu deprecated; dọn ở Giai đoạn 2 khi thay query bảng NXT. Không xóa vội trong Giai đoạn 1 để giảm bề mặt thay đổi.

### 4.5. Test (BẮT BUỘC trước khi báo xong — Vitest, đã có `vitest.config.ts`)

Hàm thuần `computeMovingCost()` (tách riêng để test không cần DB):
1. Nhập 10@100 rồi 10@120 → avg 110; xuất 5 → unit_cost 550 (5×110), avg vẫn 110, qty 15.
2. Nhập tiếp 5@140 → avg = (15×110 + 5×140)/20 = 117.5.
3. Để trống đơn giá khi nhập → dùng avg hiện hành, avg không đổi.
4. Xuất quá tồn (kho âm): qty về âm, avg giữ; nhập lại lấy giá lô mới (nhánh qty0≤0).
5. Luân chuyển: avg & qty tổng không đổi; 2 kho đổi số lượng.
6. Số dư đầu kỳ 2 kho cùng mã cùng giá → avg = đơn giá đó; qty tổng = tổng 2 kho.
7. Lãi gộp: bán 5@unit_price 200, cost 110 → revenue 1000, cogs 550, profit 450, margin 45%.
8. **BẤT BIẾN không chênh (ca then chốt — §4.2.bis):** dựng kịch bản nhập-xuất xen kẽ giá biến động (đầu kỳ → nhập @100 → bán → nhập @200 → bán), rồi khẳng định: (a) `Σ giá vốn xuất từng lần (liên hoàn)` === `value_out` tổng hợp khi khóa sổ; (b) `value_open + value_in` === `value_out + value_close`; (c) mỗi `cost_price` đơn bán === `unit_cost` dòng `order_deduction` tương ứng. Tất cả khớp tuyệt đối (sai số 0).

Test tích hợp Postgres (theo harness PGlite đã có — `D:\tmp\kbit-local`): chạy chuỗi RPC thật, kiểm `product_moving_cost`, `warehouse_transactions.unit_cost`, `customer_order_items.cost_price`, và **chạy lại ca bất biến §4.5.8 trên DB thật**.

### 4.6. Review độc lập
Sau khi code + test xanh: bung `superpowers:requesting-code-review` (reviewer context sạch) vì đụng số liệu kế toán. Vá BLOCKER trước khi báo Anh Thịnh nghiệm thu.

---

## 5. Giai đoạn 2 — Bảng NXT (thiết kế đã chốt 2026-06-06)

**Quyết định Anh Thịnh:**
- **Luân chuyển:** chỉ đổi kho + số lượng, KHÔNG đổi đơn giá/BQ. Trong bảng NXT: **xem 1 kho** → `transfer_in` tính vào Nhập của kho, `transfer_out` vào Xuất của kho (để tồn cuối kho khớp tồn thực); **xem TỔNG mọi kho** → BỎ luân chuyển khỏi Nhập/Xuất (nội bộ, net 0).
- **Chỉ hiện mã có hoạt động/tồn:** lọc dòng có (tồn đầu ≠ 0) HOẶC (nhập ≠ 0) HOẶC (xuất ≠ 0) HOẶC (tồn cuối ≠ 0).

**RPC mới `kbit_inventory_nxt(p_period text, p_warehouse_id uuid default null)` returns table** — suy từ sổ cái, cùng quy ước cộng dồn `unit_cost` như `kbit_close`:
- Mỗi dòng: product_id, code, name, qty_open, value_open, qty_in, value_in, qty_out, value_out, qty_close, value_close, avg_cost.
- **Tồn đầu kỳ** = cộng dồn tới trước `period-01` (+ `opening` của chính kỳ): receipt/transfer_in/opening (+), issue/order_deduction/transfer_out (−). Lọc theo kho nếu có.
- **Nhập trong kỳ** = receipt [+ transfer_in nếu lọc 1 kho]; **Xuất trong kỳ** = issue/order_deduction [+ transfer_out nếu lọc 1 kho]. Khi `p_warehouse_id IS NULL` → KHÔNG gồm transfer.
- **Tồn cuối** = qty_open + qty_in − qty_out; value tương ứng (cộng dồn). `avg_cost` = value_close/qty_close (hiển thị), 0 nếu qty_close ≤ 0.
- Đơn giá BQ theo MÃ (toàn cty); value theo kho = Σ unit_cost từng dòng kho → tổng các kho = value toàn mã.
- Kỳ đã khóa: có thể đọc thẳng snapshot `inventory_cost_periods` (theo mã, không lọc kho) — hoặc luôn tính live từ sổ cho nhất quán; chốt khi code.

**UI:** trang `/kho` — chọn tháng (`<input type=month>`) + lọc kho (dropdown gồm "Tất cả kho" + 3 kho); bảng cụm cột như mẫu ảnh (Tồn đầu | Nhập | Xuất | Tồn cuối, mỗi cụm SL+Thành tiền; + Đơn giá BQ). Tô đỏ tồn âm. Nút Chốt kỳ + dọn menu để **G3**.

## 6. Giai đoạn 3 — Gộp giao diện (phác thảo, sẽ spec riêng)

- `lib/nav.ts`: bỏ 3 item `/kho/nhap`, `/kho/xuat`, `/kho/luan-chuyen` và item `/kho/gia-von`. Nhóm Kho còn: Tồn kho · Lịch sử · Số dư đầu kỳ.
- Trang `/kho`: 2 nút "Nhập kho" / "Xuất kho" đầu trang mở `Dialog` chứa `StockMutationForm` (ô "Loại phiếu": Nhập/Xuất/Luân chuyển). Nút Nhập mở sẵn mode receipt, Xuất mở mode issue; đổi sang transfer trong popup. Submit xong đóng popup + refresh.
- Nút "Chốt kỳ / Khóa sổ" đặt cạnh ô chọn tháng trên trang Tồn kho.
- 3 route `/kho/nhap|xuat|luan-chuyen` có thể giữ tạm (redirect về `/kho`) hoặc xóa — quyết khi spec G3.
- Form số dư đầu kỳ thêm chọn **Kho**.

---

## 7. Rủi ro & Mở ngỏ (xử lý khi vào từng giai đoạn)

> **Đã vá sau review độc lập (2026-06-06):**
> - **BLOCKER giá vốn nhập khẩu:** `features/imports/actions.ts` trước đây cộng tồn bằng `kbit_adjust_stock` (chỉ số lượng) → BQ không thấm giá mua → bán ra giá vốn 0. ĐÃ đổi sang `kbit_receive_stock(p_unit_cost=unitCosts[i])` + `kbit_adjust_stock` nay cập nhật BQ đúng hướng (delta>0 như nhập, delta<0 như xuất).
> - **BLOCKER khóa sổ sót `opening`:** dòng `opening` ở `period-01` rơi vào kẽ (không `< v_start`, không `receipt`). ĐÃ vá: tồn đầu kỳ gồm `opening` của chính kỳ.

1. **`adjustment` chưa vào snapshot khóa sổ (mở ngỏ G2):** `kbit_adjust_stock` đã cập nhật BQ + tồn ĐÚNG, nhưng dòng sổ `adjustment` (do `orders/actions.ts` ghi khi sửa đơn bán đã trừ kho) KHÔNG được `kbit_close_inventory_cost` tính vào nhập/xuất → snapshot khóa sổ có thể lệch tồn thực khi kỳ có sửa đơn. Cache giá vốn realtime (dùng hằng ngày) vẫn đúng. → Khi làm bảng NXT (G2) phải thống nhất `adjustment` vào sổ + quy ước dấu (cột `qty>0`); cân nhắc cho `kbit_adjust_stock` tự ghi sổ atomic thay vì caller ghi tay.
2. **Replay/chữa lệch cache:** nếu `product_moving_cost` lệch sổ, cần hàm rebuild. → Tùy chọn, nên có.
3. **Khóa kỳ kế toán (`accounting_periods`) vs khóa sổ kho:** nối 2 cơ chế hay độc lập? → Làm rõ ở G1 (chốt kỳ kho set snapshot; tôn trọng `0008_period_lock_trigger`).
4. **Next.js bản tùy biến:** đọc `node_modules/next/dist/docs/` trước khi viết code UI (G2, G3) — theo `kbit/AGENTS.md`.

## 8. Tiêu chí hoàn thành Giai đoạn 1
- [ ] Migration `0029` chạy sạch trên harness PGlite.
- [ ] Mọi RPC kho cập nhật `product_moving_cost` & ghi `unit_cost` đúng công thức liên hoàn.
- [ ] `cost_price` dòng bán có ngay khi trừ kho (không chờ chốt).
- [ ] Test đơn vị (8 ca §4.5, gồm ca BẤT BIẾN không chênh) + test tích hợp Postgres: XANH.
- [ ] **Bất biến không chênh (§4.2.bis) được test khẳng định trên DB thật:** giá vốn liên hoàn cộng dồn === giá vốn khóa sổ; Đầu+Nhập = Xuất+Cuối; cost_price đơn bán === unit_cost xuất kho. Sai số 0.
- [ ] Review độc lập: hết BLOCKER.
- [ ] Anh Thịnh nghiệm thu trước khi sang Giai đoạn 2.
