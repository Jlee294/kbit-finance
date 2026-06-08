# Kế hoạch cải tiến app kbit — theo phản hồi Anh Thịnh (2026-06-07)

Thứ tự thực hiện: **A → B → D&E → C** (làm từng nhóm, có kiểm chứng, không gộp ẩu).

---

## NHÓM A — Sửa nhanh, thấy ngay  ✅ XONG (verify browser thật)

- [x] **A1. Lãi gộp tự mở đúng kỳ có dữ liệu** — verify: vào /bao-cao/lai-gop tự nhảy kỳ 2026-01, lãi gộp 2.376.000đ (39.6%), hết cảnh báo trống. Test pure 6/6 xanh.
- [x] **A2. Đồng bộ 2 nhật ký** — token `LIST_WRAP/THEAD/ROW`; verify /don-hang & /nhap-khau render class GIỐNG HỆT, padding hàng 12px như nhau.
- [x] **A3. Form tạo đơn hết tràn** — `DIALOG_LG` 4xl→5xl; verify dialog 973px, bảng dòng hàng needsHScroll=false (hết kéo ngang).
- Kiểm chứng tổng: `npm test` 6/6 xanh · `tsc --noEmit` 0 lỗi · browser app demo OK.

---

## NHÓM B — Đồng bộ kho tự động  ◀ CODE XONG, đang review độc lập

Chốt: không làm Hủy đơn; đánh dấu Kho chính/công ty; cho kho âm. Spec: docs/superpowers/specs/2026-06-08-dong-bo-kho-tu-dong-design.md
- [x] Migration 0036: cột is_default + ràng buộc 1 kho chính/cty + backfill + RPC kbit_default_warehouse. Test PGlite 7/7.
- [x] Pure helper shouldDeductOrderStock (test 6/6) + maybeDeductOrderStock (orchestration chung).
- [x] orders/actions: create/update/setFulfillmentStatus đều gọi maybeDeductOrderStock (bịt lỗ hổng Nháp→Xác nhận).
- [x] imports/actions: tự dùng kho chính khi không chọn.
- [x] deductOrderStock: bỏ chặn tồn → cho kho âm.
- [x] Forms bán/mua: bỏ "— Không trừ/nhập kho —", mặc định kho chính; admin Kho: ô đánh dấu + cột Kho chính.
- [x] Offline test xanh: 121/121 (PGlite + pure). tsc 0 lỗi.
- [x] Review độc lập: bắt 1 CRITICAL (trừ kho hồi tố đơn cũ — vi phạm spec) → ĐÃ VÁ (gate cameFromDraftOrNew + previousStatus) + regression test. Minor (concurrency single-user) ghi nhận.
- [x] Migration 0036 lên cloud demo (Anh Thịnh chạy SQL dashboard, Success).
- [x] Verify browser: Quản lý kho có cột "Kho chính" (mỗi cty 1 kho); form tạo đơn tự chọn kho chính, hết "Không trừ kho"; lãi gộp tự mở kỳ 2026-01 đúng số.

## DATA — Làm lại bộ demo  ✅ XONG
- [x] Seed mới CHỈ nhập 4 nguồn (mua/bán/ngân hàng/linh tinh) — bỏ khai kho trực tiếp (opening/luân chuyển/xuất hủy/điều chỉnh).
- [x] Chạy seed: TẤT CẢ ĐỐI CHIẾU KHỚP (NXT bất biến, tồn=sổ cái, giá vốn BQ, ngân hàng, công nợ, bảng kê, lãi gộp). Data chảy tự động đúng.
- Lãi gộp: MINTVN 16.003.638đ · KBIT 2.720.000đ · GLA 2.520.000đ (kỳ 2026-01).

## NHÓM D&E  ◀ CODE XONG, đang review độc lập
- [x] E4 mô tả: subtitle "Kỳ kế toán" + "Tài liệu đính kèm" (đổi tên trang Chứng từ → Tài liệu đính kèm).
- [x] D1 Đối tác: trang /danh-muc/doi-tac 2 tab (KH/NCC) tái dùng catalog cũ; nav gộp; 2 route cũ redirect.
- [x] D2 Loại thuế: migration 0037 (bảng tax_types + RLS + seed 5 loại) + CRUD /danh-muc/loai-thue (ẩn, không xóa cứng); Lịch thuế đọc loại thuế từ DB. Test PGlite 4/4. (Kế hoạch thuế giữ nguyên — ngoài yêu cầu.)
- [x] E3 quyền duyệt: migration 0038 (kbit_can_approve +CEO; nới tự duyệt cho admin/KTT/CEO) + lib/auth canApprove +ceo. CEO khóa kỳ được (qua RLS). Test PGlite 5/5.
- [x] Offline 131/131 xanh, tsc 0 lỗi.
- [x] Review độc lập: Ready Yes, KHÔNG Critical/Important. Vá 1 Minor (khóa sửa mã loại thuế khi edit).
- [x] Đẩy migration 0037+0038+0039 lên cloud demo (Anh Thịnh chạy SQL) + verify browser (Đối tác, Loại thuế, Lịch thuế dropdown DB, redirect, mô tả). XONG, commit dfc61e5.

## NHÓM C — Toàn cục  ◀ ĐANG LÀM (làm theo đợt)
Chốt: bỏ ô công ty lẻ (dùng toàn cục); làm theo đợt.
### Đợt 1a — XONG (hạ tầng + 4 trang from/to)
- [x] Thanh chọn CÔNG TY + NĂM toàn cục ở đầu app (topbar), lưu cookie (lib/global-filter + features/global-filter/actions + GlobalFilterBar). Verify: đổi công ty → bảng kê lọc theo.
- [x] Bộ lọc THÁNG (Cả năm/1-12) + khoảng ngày dùng chung: MonthRangeFields + lib/date-range (yearMonthRange/resolveRange, test 8/8).
- [x] Áp: Bảng kê bán ra, Bảng kê mua vào, Ngân hàng, Công nợ (bỏ ô công ty/năm lẻ; dùng global + lọc tháng). Verify browser OK.
### Đợt 1b — XONG (Lãi gộp + Kho)
- [x] Lãi gộp: grossProfit(from,to,company) theo khoảng ngày; global company + năm + tháng (cả năm/1 tháng). Bỏ ô công ty trong trang. Verify: KBIT cả năm 2026 = 2.720.000đ (khớp seed).
- [x] Kho: global company + kỳ tháng (year+month). Bỏ ô công ty trong NxtTable. Verify: KBIT kỳ 2026-06, 2 mã.
- [x] Lịch sử kho: bỏ ô công ty lẻ, dùng global.
### Đợt 1c — XONG ✅ (NHÓM C HOÀN TẤT)
- [x] Số dư đầu kỳ kho: page global company + kỳ; OpeningBalanceClient bỏ ô công ty.
- [x] Báo cáo (bao-cao + hop-nhat): ReportFilters bỏ ô công ty, dùng global; giữ dự án + khoảng ngày.
- [x] Sức khỏe (rui-ro): RuiRoFilters bỏ ô công ty, dùng global.
- [x] Nhật ký bán ra (don-hang): listOrders(companyId) global. Verify: KBIT → 1 đơn.
- [x] Nhật ký mua vào (nhap-khau): listImportOrders(companyId) global.
- [x] Chi VN (listExpensesVN companyId), Chi KR (thêm companyId vào listKrExpenses).
- [x] Chứng từ khác (global + lọc tháng), Kế hoạch thuế (global company + năm).
- [x] tsc 0 lỗi, offline 166/166. Verify browser: don-hang lọc theo công ty, bao-cao bỏ ô công ty.

## ✅ TOÀN BỘ A→E + C HOÀN TẤT (6 commit). Mọi trang số liệu lọc theo Công ty+Năm toàn cục.

## NHÓM D — Danh mục

- [ ] Gộp Khách hàng + NCC → menu "Đối tác" (2 tab, lọc theo loại).
- [ ] Lịch thuế: cho thêm/sửa/xóa "Loại thuế" (hiện cứng trong code).

## NHÓM E — Kế toán

- [ ] Nới "người duyệt khác người nhập": admin/KTT/giám đốc được tự duyệt.
- [ ] Cho Giám đốc (CEO) quyền duyệt (hiện chưa có).
- [ ] Viết mô tả dễ hiểu cho "Kỳ kế toán" + "Tài liệu đính kèm".

## NHÓM C — Toàn cục (làm sau cùng, đụng nhiều trang)

- [ ] Ô chọn công ty + năm ở đầu app (header), lọc toàn bộ số liệu.
- [ ] Bộ lọc tháng (12 tháng) / khoảng ngày dùng chung cho mọi sheet có lọc.

---

## Review (cập nhật khi xong từng nhóm)
- (chưa có)
