# Thiết kế lại Menu + Đổi thương hiệu sang Xanh ngọc

**Ngày:** 2026-06-05
**Trạng thái:** Đã chốt thiết kế (qua brainstorming + xem trực quan), chờ viết plan triển khai.

---

## A. PHẦN CHO ANH THỊNH (dễ đọc)

**Mục tiêu:** Menu sạch – sáng – gọn, tông **xanh lá cây nhẹ (xanh ngọc)**, tinh tế. Cả app đồng bộ một tông.

**Đã chốt 3 điều khi xem trực quan:**
1. **Màu:** Xanh ngọc (emerald). Thay cho navy hiện tại.
2. **Kiểu menu:** Mỗi mục có **icon**; 6 nhóm **gập/mở được**; nhóm chứa trang đang xem **tự mở**; app **nhớ** nhóm nào đang mở.
3. **Phạm vi:** **Đồng bộ cả app** — nút bấm, thẻ số liệu, link… đều xanh ngọc. Riêng dấu hiệu **đúng/sai** vẫn **xanh lá – vàng – đỏ** (sắc xanh "đạt" chỉnh hơi khác xanh thương hiệu để không nhầm với nút bấm).

**Không nằm trong lần này** (giữ nguyên, làm sau nếu cần): chế độ tối (dark mode), menu thu gọn kiểu điện thoại (hamburger).

---

## B. PHẦN KỸ THUẬT (cho người triển khai)

### B0. Ràng buộc bắt buộc
- **Next.js 16.2.6 khác bản thường.** Theo `kbit/AGENTS.md`: **đọc `node_modules/next/dist/docs/`** cho các API đụng tới (Client Components, `Link`, `usePathname`) **trước khi viết code**. Không code theo trí nhớ.
- **Chỉ đổi qua biến màu gốc** để cả app ăn theo — không sửa màu rải rác từng trang.
- **Giữ nguyên hành vi nghiệp vụ:** lọc quyền `COST_ROUTES` (Sản phẩm chỉ admin/ceo), `isActive()`, mọi `href`/`label` y nguyên.

### B1. Bảng màu mới — `app/globals.css`

**B1.1 — Đổi thang `--color-brand-*` (block `@theme`, dòng 14–24) từ navy → emerald chuẩn:**

| Biến | Cũ (navy) | Mới (emerald) |
|---|---|---|
| `--color-brand-50`  | #f3f2fb | `#ecfdf5` |
| `--color-brand-100` | #e7e5f6 | `#d1fae5` |
| `--color-brand-200` | #cfcbed | `#a7f3d0` |
| `--color-brand-300` | #a9a3d8 | `#6ee7b7` |
| `--color-brand-400` | #7e76bd | `#34d399` |
| `--color-brand-500` | #5b51a3 | `#10b981` |
| `--color-brand-600` | #463d87 | `#059669` |
| `--color-brand-700` | #36306c | `#047857` |
| `--color-brand-800` | #201b51 | `#065f46` |
| `--color-brand-900` | #181341 | `#064e3b` |
| `--color-brand-950` | #0d0925 | `#022c22` |

Cập nhật luôn comment đầu block (dòng 8–11) cho khớp: brand chính giờ là xanh ngọc `#059669`.

**B1.2 — `:root` (dòng 96, 107):** `--primary: #201b51` → `#059669`; `--ring: #201b51` → `#059669`. (`--primary-foreground` giữ `#ffffff`.)

**B1.3 — Tách màu `success` khỏi brand** (vì brand giờ là emerald, trùng success cũ). Đổi `success` sang green ngả vàng hơn để phân biệt rõ:

| Biến | Cũ | Mới |
|---|---|---|
| `--color-success-50`  | #ecfdf5 | `#f0fdf4` |
| `--color-success-500` | #10b981 | `#22c55e` |
| `--color-success-700` | #047857 | `#15803d` |

`warning` / `danger` / `info` **giữ nguyên**.

**B1.4 — `.dark` (dòng 124–156):** KHÔNG đổi lần này (ngoài phạm vi). Ghi chú: brand-* không dùng trong nhánh dark hiện tại nên không ảnh hưởng.

### B2. Logo + khung sidebar — `app/(app)/layout.tsx`

- Khối logo (dòng 33–41) hiện `bg-brand-800` (sẽ thành xanh đậm `#065f46`). Đổi thành **gradient xanh ngọc** cho khớp bản duyệt: nền `bg-gradient-to-br from-brand-600 to-brand-500` (tức `#059669`→`#10b981`), ô chữ "K" giữ `bg-white/15`, chữ trắng. Bo góc `rounded-xl`.
- Phần còn lại (`aside w-56`, user info, `text-brand-700`) giữ nguyên — tự ăn màu mới.

### B3. Menu — viết lại `app/(app)/Sidebar.tsx`

Đây là phần thay đổi chính. Giữ `'use client'`. Yêu cầu:

**B3.1 — Thêm icon mỗi mục.** Mở rộng kiểu dữ liệu item: thêm field `icon` (component lucide). Import từ `lucide-react`. **Phải kiểm tra tên icon có tồn tại trong `lucide-react@1.17.0`** đã cài (mở `node_modules/lucide-react` xác nhận export trước khi dùng; nếu thiếu, chọn icon gần nghĩa). Map đề xuất (Mục → icon):

- **Tổng quan:** Báo cáo→`BarChart3` · Công nợ→`Wallet` · Bảng kê bán ra→`ClipboardList` · Bảng kê mua vào→`ClipboardCheck` · Sức khỏe→`Activity`
- **Giao dịch:** Nhật ký bán ra→`ShoppingCart` · Nhật ký mua vào→`Truck` · Ngân hàng→`Landmark` · Chứng từ khác→`Files`
- **Kho hàng:** Tồn kho→`Package` · Nhập kho→`PackagePlus` · Xuất kho→`PackageMinus` · Luân chuyển→`ArrowLeftRight` · Lịch sử→`History`
- **Kế toán:** Duyệt & Khóa kỳ→`Lock` · Tài liệu đính kèm→`Paperclip` · Công việc→`ListTodo` · Kỳ kế toán→`CalendarRange` · Loại chứng từ→`FileType` · Thư viện NV→`BookOpen`
- **Tài chính:** Kế hoạch thuế→`Calculator` · Lịch thuế→`CalendarClock`
- **Danh mục:** Công ty→`Building2` · Dự án→`FolderKanban` · Khách hàng→`Users` · Mã hàng→`Barcode` · Nhà cung cấp→`Factory` · Tài khoản NH→`CreditCard` · Sản phẩm→`Box` · Tỷ giá→`ArrowRightLeft`

Icon: 16×16, `strokeWidth={1.75}`, màu mặc định xám (`text-gray-400`), khi active/hover → `text-brand-600`.

**B3.2 — Nhóm gập/mở (collapse).**
- Mỗi group header là `<button>` (không phải `<p>`), bấm toggle mở/đóng, có chevron bên phải (`ChevronDown` khi mở / xoay khi đóng), giữ style chữ nhỏ uppercase, đậm, giãn chữ (`tracking-widest`).
- **Màu header theo trạng thái** (khớp bản duyệt): nhóm **đang mở** = `text-brand-600`; nhóm **đang đóng** = `text-gray-400`. Chevron cùng màu header. → giúp mắt thấy ngay nhóm nào đang mở.
- **Trạng thái mở mặc định = nhóm có chứa route active** (tính từ `pathname`, ổn định cả phía server → tránh lệch hydration).
- **Nhớ lựa chọn người dùng** bằng `localStorage` (key vd `kbit:nav:openGroups`). **Chỉ đọc localStorage sau khi mount** (`useEffect`), không đọc trong render đầu → tránh lỗi hydration mismatch (Next 16 nghiêm ngặt). Quy tắc hợp nhất: nhóm chứa active **luôn được ép mở** dù localStorage lưu đóng.
- Khu vực nội dung nhóm: nên có chuyển động mở/đóng mượt (đơn giản: ẩn/hiện; nếu thêm animation thì dùng `tw-animate-css` đã có, không kéo thêm thư viện).

**B3.3 — Trạng thái mục.**
- Active: `bg-brand-50 text-brand-700 font-semibold`, **vạch dọc trái** 3px bo góc phải màu `brand-600` (dùng `relative` + `::before` hoặc 1 `<span>` định vị tuyệt đối), icon `text-brand-600`. **Bỏ chấm tròn cũ** ở cuối dòng (thay bằng vạch trái).
- Mặc định: `text-gray-700`, icon `text-gray-400`.
- Hover: `hover:bg-brand-50/60 hover:text-brand-700`, icon theo.
- Kích thước/spacing giữ tinh gọn như hiện tại (cỡ chữ ~13px, `rounded-md`, padding gần `px-3 py-1.5`, icon cách chữ ~10px).

**B3.4 — Tách logic để test được.** Đưa các hàm thuần ra ngoài component (cùng file hoặc `lib/nav.ts`): `isActive(pathname, href)`, `groupContainsActive(group, pathname)`, `mergeOpenState(saved, forcedOpenLabels)`. Component chỉ ráp UI.

### B4. Kiểm thử (vitest — dự án đã có `vitest.config.ts`)
Viết test cho **logic thuần** (không phụ thuộc DOM phức tạp):
- `isActive`: khớp đúng route con (`/kho` active khi ở `/kho/nhap`), không khớp nhầm tiền tố (`/khoa` ≠ `/kho`).
- `groupContainsActive`: trả đúng nhóm chứa route hiện tại.
- `mergeOpenState`: nhóm chứa active luôn mở dù saved=đóng; tôn trọng saved cho nhóm khác.
- Lọc quyền: `COST_ROUTES` ẩn "Sản phẩm" khi role ≠ admin/ceo (giữ hành vi cũ — regression).

Nếu dự án đã cấu hình React Testing Library thì thêm 1 test render: bấm header → nhóm đóng/mở. Nếu chưa có sẵn, **không tự dựng hạ tầng test component** trong phạm vi này (YAGNI) — ưu tiên test logic ở trên.

### B5. Tự kiểm trước khi báo xong (verification)
- `npm run build` (hoặc lệnh build dự án) **exit 0**, không lỗi type/hydration.
- `npm test` liên quan **xanh**.
- Chạy thật, xem mắt: menu xanh ngọc, icon đúng mục, gập/mở hoạt động, nhóm chứa trang hiện tại tự mở, active có vạch trái xanh, nút/thẻ ở thân app cũng xanh đồng bộ.

### B6. Danh sách file đụng tới
1. `app/globals.css` — thang brand → emerald; `--primary`/`--ring`; tách success. *(cả app đổi màu từ đây)*
2. `app/(app)/layout.tsx` — logo gradient xanh ngọc.
3. `app/(app)/Sidebar.tsx` — viết lại: icon + collapse + active vạch trái.
4. *(tùy chọn)* `lib/nav.ts` — tách hàm thuần để test.
5. `*.test.ts` — test logic nav + regression quyền.

### B7. Rủi ro đã lường
- **Hydration mismatch** do localStorage: chặn bằng cách chỉ đọc sau mount; mặc định server-render theo `pathname`. → B3.2.
- **Brand ≈ success** (đều xanh): đã tách success sang green ngả vàng. → B1.3.
- **Tên icon lucide không tồn tại** ở v1.17: xác minh export trước khi dùng. → B3.1.
- **Next 16 API lạ:** đọc docs trong `node_modules` trước khi code. → B0.
