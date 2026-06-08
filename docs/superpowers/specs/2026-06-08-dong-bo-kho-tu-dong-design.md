# Thiết kế: Đồng bộ kho tự động theo mã hàng (Nhóm B)

Ngày: 2026-06-08 · Trạng thái: ĐÃ DUYỆT (Anh Thịnh) · Tác giả: Claude

## Mục tiêu (nguyên văn yêu cầu Anh Thịnh)
Khi nhập Nhật ký bán ra / mua vào mà dòng **có mã hàng** → hệ thống **tự trừ/cộng kho**,
không bắt người dùng thao tác kho ở 2 nơi. Dòng **không có mã hàng** → bỏ qua. Đơn bán
**Nháp** → chưa trừ. Bỏ hẳn lựa chọn "— Không trừ kho —".

## Quyết định nghiệp vụ đã chốt (AskUserQuestion 2026-06-08)
1. **Hủy đơn**: CHƯA làm bây giờ (không thêm trạng thái "Đã hủy"). Chỉ xử lý Nháp.
2. **Kho mặc định**: Đánh dấu **1 "Kho chính" / công ty**. Tự dùng kho chính; nhiều kho vẫn đổi được.
3. **Thiếu tồn khi bán**: **Cho phép kho âm** (hiện đỏ), bỏ chặn báo lỗi.

## Hiện trạng (đọc gốc)
- Trừ kho bán: `createOrder` chỉ trừ khi `warehouse_id` được CHỌN + `status != draft` (orders/actions.ts:144).
- Cộng kho mua: `createImportOrder` chỉ cộng khi `warehouse_id` được CHỌN (imports/actions.ts:91).
- Form mặc định `warehouse_id=''` → "— Không trừ kho —" (OrderForm.tsx:367, ImportOrderForm.tsx).
- **Lỗ hổng**: `setFulfillmentStatus` (Nháp→Xác nhận) KHÔNG trừ kho (orders/actions.ts:318).
- `deductOrderStock` CHẶN khi tồn < cần (warehouse/actions.ts:104-118) — mâu thuẫn "cho kho âm".
- `warehouses` chưa có cột "kho chính" (chỉ is_active, company_id) — migration 0012.
- RPC `kbit_deduct_order_batch` đã cho kho âm (test moving_average_cost: "kho âm").

## Thiết kế

### 1. Kho chính (DB)
- Migration mới: `alter table warehouses add column is_default boolean not null default false`.
- Ràng buộc tối đa 1 kho chính/công ty: `create unique index ... on warehouses(company_id) where is_default`.
- Backfill: mỗi công ty chưa có kho chính → đặt kho **active có code nhỏ nhất** làm `is_default=true`.
- `listWarehouses` + `listWarehousesAdmin` trả thêm `is_default`.
- Hàm chọn kho mặc định (TS): `defaultWarehouseId(companyId)` = kho `is_default && is_active`; fallback kho active code nhỏ nhất; null nếu công ty không kho.

### 2. Pure helper (testable)
`shouldDeductOrderStock({ fulfillmentStatus, stockDeducted, hasItemWithProduct, hasWarehouse }) → boolean`
- true ⇔ `!stockDeducted && fulfillmentStatus !== 'draft' && hasItemWithProduct && hasWarehouse`.
- Dùng cho cả create/update/đổi-trạng-thái → 1 nguồn sự thật.

### 3. Orchestration (TS) — bán
- Helper `maybeDeductOrderStock(orderId)`: đọc đơn + items, nếu `shouldDeductOrderStock(...)` → gọi `deductOrderStock` (kho = warehouse_id đơn, hoặc kho chính nếu trống).
- `createOrder`: nếu `warehouse_id` trống → gán kho chính của công ty. Sau insert items → `maybeDeductOrderStock`.
- `updateOrder`: nếu `existing.stock_deducted` → giữ logic điều chỉnh delta (đã có). Nếu CHƯA trừ → sau khi lưu gọi `maybeDeductOrderStock` (trừ lần đầu khi đơn rời Nháp).
- `setFulfillmentStatus`: sau khi đổi sang status ≥ confirmed → `maybeDeductOrderStock` (BỊT LỖ HỔNG).

### 4. Orchestration (TS) — mua
- `createImportOrder`: nếu `warehouse_id` trống → gán kho chính. Có dòng product_id → cộng kho (đã có cơ chế, chỉ bỏ điều kiện "phải chọn kho").

### 5. Cho kho âm
- Bỏ vòng kiểm tra `available < quantity` trong `deductOrderStock` (warehouse/actions.ts:104-118).
  RPC tự cho âm; tồn âm hiện đỏ ở trang Kho (đã có).

### 6. Form
- `OrderForm` + `ImportOrderForm`: bỏ option "— Không trừ/nhập kho —". `warehouseId` khởi tạo = kho chính công ty; đổi công ty → cập nhật kho chính mới. Nhiều kho: dropdown đổi được (không còn lựa chọn "không trừ"). Công ty 0 kho: ẩn (không trừ, đành chịu).

## Phạm vi KHÔNG làm (YAGNI / tránh xáo trộn)
- KHÔNG trừ hồi tố đơn bán cũ đã tạo kiểu "không trừ kho".
- KHÔNG thêm trạng thái Hủy đơn (chốt sau).
- Đơn mua đã cộng kho vẫn chặn đổi mã hàng/SL khi sửa (quy tắc sẵn có).

## Kiểm thử
- Unit (vitest): `shouldDeductOrderStock` mọi nhánh.
- PGlite (supabase/tests): (a) ràng buộc 1 kho chính/công ty; (b) backfill kho chính; (c) bán có mã hàng → trừ; (d) bán quá tồn → âm (không lỗi); (e) đơn Nháp → không trừ; (f) mua có mã hàng → cộng kho chính khi không chọn kho.
- Browser (app demo): tạo đơn bán/mua không chọn kho → kho tự đổi; Nháp→Xác nhận trừ kho; trang Kho/Lãi gộp khớp.
- Reviewer độc lập trước khi báo xong.

## Tệp đụng tới
- `supabase/migrations/00xx_warehouse_default.sql` (mới)
- `features/warehouse/queries.ts`, `features/warehouse/actions.ts`
- `features/orders/actions.ts`, `features/orders/stock-sync.ts` (helper mới, pure + orchestration)
- `features/imports/actions.ts`
- `features/orders/components/OrderForm.tsx`, `features/imports/components/ImportOrderForm.tsx`
- trang Danh mục → Kho (đánh dấu kho chính)
- tests: `features/orders/stock-sync.test.ts`, `supabase/tests/warehouse_default.test.ts`
