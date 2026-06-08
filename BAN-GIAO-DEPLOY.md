# Bàn giao deploy — kbit-finance (2026-06-08)

> Gói này KHÔNG kèm `node_modules`, file `.env` (mật khẩu) và công cụ demo — vì lý do dung lượng & bảo mật.

## 1. Cài đặt
```bash
npm install
```

## 2. Biến môi trường
Tạo `.env.local` từ `.env.example`, điền key Supabase **production** của bạn:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
*(Gói này không chứa key — đặt key production của bạn vào.)*

## 3. Database (Supabase) — QUAN TRỌNG
Chạy các migration trong `supabase/migrations/` **theo đúng thứ tự số**, các bản CHƯA có trên DB production. Mới trong đợt này:
- `0025_fix_warehouse_negative_check.sql`
- `0026_dinh_khoan_chi_thu.sql`
- `0027_allow_negative_stock.sql`
- `0028` … `0039`
- **`0040_cashbook_into_reports.sql`** ← mới nhất (đợt sửa hôm nay)

Cách chạy: `supabase db push` (nếu dùng Supabase CLI) **hoặc** dán từng file vào SQL Editor và Run theo thứ tự.

## 4. Build & chạy
```bash
npm run build && npm run start
```

## 5. Kiểm thử (đã pass sẵn)
```bash
npm run test        # 256 test logic (offline) — xanh
```

---

## Tóm tắt thay đổi đợt này — sửa 5 lỗ hổng logic kế toán

| Mã | Nội dung | File chính |
|----|----------|-----------|
| **A** | Bảng kê bán ra/mua vào kê theo **ngày hóa đơn** (invoice_date) thay vì ngày đơn; tách 2 cột Ngày HĐ + Ngày đơn; ẩn đơn chưa xuất HĐ | `features/invoices/queries.ts`, `app/(app)/bang-ke-ban-ra`, `app/(app)/bang-ke-mua-vao` |
| **B+E** | Báo cáo dòng tiền + công nợ tính cả "Chứng từ khác" (cash_book): thu→Tổng thu, chi→Tổng chi; điều chỉnh phải thu/phải trả khớp trang Công nợ; báo cáo hợp nhất quy đổi tỷ giá | `supabase/migrations/0040_cashbook_into_reports.sql`, `features/cash-book/actions.ts`, `features/debts/queries.ts` |
| **C+D** | Cảnh báo công nợ: thu/trả vượt số nợ (nghi ghi trùng) + phiếu cọc chưa gắn khi khách đang nợ | `features/debts/warnings.ts`, `features/debts/components/CongNoLedger.tsx`, `app/(app)/cong-no` |

Chi tiết thiết kế: `docs/superpowers/specs/2026-06-08-sua-5-luong-ke-toan-design.md`.
