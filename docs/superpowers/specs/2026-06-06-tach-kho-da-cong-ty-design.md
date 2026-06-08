# Thiết kế: Tách Kho & Giá vốn theo CÔNG TY (đa công ty)

- **Ngày:** 2026-06-06
- **Người yêu cầu:** Anh Thịnh (KTT, non-technical về code)
- **Trạng thái:** Chờ duyệt spec → writing-plans (Giai đoạn A)
- **Bối cảnh:** Phân hệ kho/giá vốn (đợt giá vốn liên hoàn — commit 6b98762/bc6a6c9/c15bded/b06c0be) đang GỘP CHUNG mọi công ty. Hệ thống thực tế theo dõi **nhiều công ty, mỗi công ty một bộ số + tồn kho riêng**.

---

## 1. Mục tiêu

Tách toàn bộ phân hệ kho/giá vốn theo **công ty**: mỗi công ty có tồn kho, giá vốn, báo cáo Nhập-Xuất-Tồn, lãi gộp, khóa kỳ **riêng** — không trộn số liệu giữa các công ty.

### Quyết định đã chốt với Anh Thịnh
| # | Quyết định | Giá trị |
|---|---|---|
| Q1 | Tổ chức kho | **Mỗi công ty có kho RIÊNG** (kho thuộc 1 công ty) |
| Q2 | Mã hàng | **Chung 1 danh mục** `products` (tồn + giá vốn mới tách theo công ty) |
| Q3 | Chọn công ty | **1 ô chọn Công ty ở đầu trang Kho** (như ô tháng/kho) |
| Q4 | Luân chuyển | **Chỉ trong CÙNG công ty** (kho nguồn & đích cùng công ty); chéo công ty là mua-bán nội bộ, ngoài phạm vi |
| Q5 | Tạo kho | **Cần trang quản lý Kho** (admin CRUD kho, gắn công ty) — app hiện CHƯA có |

---

## 2. Hiện trạng (nguồn sự thật)

- 3 công ty (seed `supabase/seed.sql`): MINTVN, KBIT, GLA. `accounting_periods` + trigger khóa kỳ `0008` ĐÃ theo `(company_id, period)`.
- `warehouses` (0012): **KHÔNG có company_id**, seed cứng 3 kho chung KHO-VN/KR/BB. **Chưa có UI quản lý kho** (xác nhận: grep không có insert/update warehouses).
- `warehouse_transactions`, `warehouse_stock`: **KHÔNG company_id**.
- `product_moving_cost` (0030): PK `product_id` — giá vốn BQ **gộp mọi công ty**.
- `inventory_cost_periods` (0028): unique `(product_id, period)` — **gộp mọi công ty**.
- `kbit_inventory_nxt`, các RPC kho: **không có company**.
- App KHÔNG có "công ty hiện hành" toàn cục — mỗi giao dịch (đơn/thu/chi) chọn company trong form.

---

## 3. Mô hình dữ liệu mới

- **`warehouses` + `company_id`** (FK companies, NOT NULL). Mỗi kho thuộc đúng 1 công ty. `code` đổi unique theo `(company_id, code)` (mỗi công ty có thể có mã kho riêng).
- **`products`**: GIỮ NGUYÊN (danh mục chung).
- **`warehouse_transactions` + `company_id`** (denormalized — RPC tự điền = `warehouses.company_id` của kho). Lý do: trigger khóa kỳ + báo cáo lọc theo công ty nhanh, không phải join; RPC đảm bảo đồng bộ (luôn = công ty của kho).
- **`warehouse_stock`**: GIỮ khóa `(warehouse_id, product_id)` — kho đã thuộc 1 công ty ⇒ tồn tách theo công ty tự nhiên.
- **`product_moving_cost`**: đổi PK → **`(company_id, product_id)`**. Giá vốn BQ liên hoàn riêng từng công ty.
- **`inventory_cost_periods`**: đổi unique → **`(company_id, product_id, period)`**. Snapshot khóa sổ riêng công ty.
- **Khóa kỳ kho:** thêm trigger `before insert/update on warehouse_transactions` gọi `kbit_assert_period_open(NEW.company_id, NEW.txn_date)` — chặn ghi kho vào kỳ công ty đó đã khóa (admin mở khóa mới ghi — đúng quy trình Anh Thịnh chốt).

---

## 4. RPC (sửa — suy công ty từ kho)

Mọi RPC kho lookup `v_company := (select company_id from warehouses where id = p_warehouse_id)`; dùng cho cả cập nhật giá vốn lẫn ghi sổ:

| RPC | Thay đổi |
|---|---|
| `kbit_mc_receive` / `kbit_mc_issue` | Thêm `p_company_id` → key `product_moving_cost(company_id, product_id)`. |
| `kbit_receive_stock` | Suy `v_company` từ kho; cập nhật cost theo `(company, product)`; ghi `warehouse_transactions.company_id`. |
| `kbit_issue_stock` | Như trên. |
| `kbit_deduct_order_item` | Suy `v_company` từ kho; cost_price theo công ty; ghi company. (Công ty của kho phải khớp công ty của đơn — cảnh báo nếu lệch; xem §7.) |
| `kbit_transfer_stock_full` | **Ràng buộc from/to CÙNG company** (raise nếu khác); ghi company. |
| `kbit_adjust_stock` | Suy `v_company`; cost + sổ theo công ty. |
| `kbit_set_opening_stock` | Suy `v_company` từ kho (đã theo kho từ G1). Khóa opening theo `(company, product, kho, period)`. |
| `kbit_close_inventory_cost` | Thêm `p_company_id` → chốt snapshot theo `(company, product, period)`; chỉ quét giao dịch của công ty đó. |
| `kbit_inventory_nxt` | Thêm `p_company_id` (bắt buộc) → chỉ tính giao dịch `company_id = p_company_id`. |

---

## 5. Giao diện

- **Trang quản lý Kho (MỚI)** — `danh-muc/kho` (hoặc `kho/danh-muc`): bảng kho + form CRUD (code, tên, **công ty**, ghi chú, hoạt động). Thêm vào menu *Danh mục*. Chỉ admin/KTT.
- **Trang Tồn kho (`/kho`)**: thêm **ô chọn Công ty** (đầu trang, cạnh tháng/kho). Mặc định công ty đầu (hoặc nhớ lựa chọn). Dropdown Kho chỉ hiện kho của công ty đang chọn. Bảng NXT + nút Khóa sổ theo `(công ty, kỳ)`.
- **Popup nhập/xuất/luân chuyển**: kho dropdown chỉ kho của công ty đang chọn; luân chuyển chỉ trong các kho của công ty đó.
- **Số dư đầu kỳ**: thêm chọn công ty (kho lọc theo công ty).

---

## 6. Chia 3 giai đoạn (mỗi GĐ: test + review độc lập, như G1-G3)

- **GĐ A — Nền dữ liệu:** migration `0033` (company_id vào warehouses + warehouse_transactions; đổi key product_moving_cost & inventory_cost_periods; trigger khóa kỳ kho; di trú seed); sửa toàn bộ RPC (suy công ty, cost theo công ty, transfer cùng công ty); test PGlite (tách công ty + khóa kỳ kho). **Không UI.**
- **GĐ B — Trang quản lý Kho:** feature warehouses CRUD (actions/queries/schema/form) + trang Danh mục Kho + menu. test + review.
- **GĐ C — UI kho theo công ty:** ô chọn công ty + lọc kho/NXT/popup/số dư đầu kỳ/khóa sổ theo công ty. test + review.

---

## 7. Di trú & Rủi ro & Mở ngỏ

1. **Seed kho cũ:** 3 kho KHO-VN/KR/BB hiện không company. `company_id` NOT NULL ⇒ migration phải gán. Vì **chưa có dữ liệu thật**, gán tạm 3 kho cho công ty đầu tiên (MINTVN) trong migration; admin dùng trang quản lý Kho tạo/sửa kho cho 2 công ty còn lại. (Hoặc xóa 3 kho seed nếu chưa dùng — chốt khi code GĐ A.)
2. **Đơn bán ↔ kho khác công ty:** `kbit_deduct_order_item` trừ kho khi bán. Công ty của KHO (trừ) phải = công ty của ĐƠN. Cần kiểm tra/ràng buộc khi tạo đơn (chọn kho thuộc công ty của đơn). → Làm rõ ở GĐ C (form đơn bán lọc kho theo công ty đơn). Ghi nợ nếu ngoài phạm vi đợt này.
3. **Test cũ:** toàn bộ test kho hiện seed 1 ngữ cảnh không công ty → phải cập nhật seed company + kho-theo-công-ty. Thêm ca: 2 công ty cùng mã → giá vốn/tồn/NXT tách riêng, không trộn.
4. **`accounting_periods` cho công ty:** khóa kỳ kho dựa accounting_periods của công ty → công ty phải có bản ghi kỳ. Nếu chưa có kỳ → `kbit_assert_period_open` coi như mở (không chặn) — giữ hành vi 0008.

## 8. Tiêu chí hoàn thành GĐ A
- [ ] Migration 0033 chạy sạch trên PGlite (gồm di trú seed kho).
- [ ] 2 công ty cùng 1 mã hàng: nhập/xuất/giá vốn BQ/tồn/NXT/snapshot **tách riêng**, không trộn (test khẳng định).
- [ ] Luân chuyển chéo công ty bị chặn (test).
- [ ] Ghi kho vào kỳ công ty đã khóa bị chặn; công ty khác/kỳ khác không bị (test).
- [ ] Toàn bộ test kho cũ cập nhật theo công ty: XANH.
- [ ] Review độc lập: hết BLOCKER.
