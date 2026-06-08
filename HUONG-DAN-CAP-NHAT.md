# 🔴 ĐỌC FILE NÀY TRƯỚC KHI CẬP NHẬT

Đây là bản cập nhật **mã nguồn (source code)** cho dự án **kbit-finance** (Next.js + Supabase).

> Gói này **chỉ chứa code mới**. Nó **KHÔNG** chứa `node_modules` (thư viện) và `.env.local` (mật khẩu/khóa kết nối) của bạn — đó là chủ ý, để bảo mật và giảm dung lượng. Bạn **giữ nguyên** 2 thứ đó của mình.

---

## ⚠️ 3 NGUYÊN TẮC AN TOÀN — làm trước tiên

1. **SAO LƯU thư mục dự án cũ.** Copy cả thư mục hiện tại sang chỗ khác, đổi tên thành `Finance System - BACKUP`. → Nếu bản mới có lỗi, chỉ cần xóa bản mới và đổi BACKUP về là xong, **không mất gì**.
2. **KHÔNG xóa** `.env.local` và thư mục `node_modules` đang có — gói này không kèm chúng, mất là app không chạy được.
3. **SAO LƯU database** trên Supabase trước khi chạy migration: Dashboard → **Database → Backups** (hoặc bật Point-in-time Recovery). → Nếu migration có vấn đề thì khôi phục lại được.

> Làm đủ 3 bước này thì **mọi rủi ro đều quay lui được** — bạn cứ yên tâm.

---

## 🤖 CÁCH 1 (khuyên dùng): Đưa cho AI (vibe code) làm

**Bước 1** — Sao lưu (mục ⚠️ ở trên).
**Bước 2** — Giải nén gói này, **copy đè** toàn bộ vào thư mục dự án. Khi được hỏi có ghi đè không → **Đồng ý**. (`.env.local` và `node_modules` của bạn không nằm trong gói nên **không bị đụng tới**.)
**Bước 3** — Mở thư mục dự án bằng công cụ AI (Claude Code / Cursor…), rồi **dán nguyên đoạn dưới đây** cho AI:

```
Tôi vừa giải nén một bản cập nhật source code đè lên dự án Next.js + Supabase này
(đã giữ nguyên .env.local và node_modules của tôi, đã sao lưu thư mục cũ + database).
Hãy giúp tôi áp dụng bản cập nhật AN TOÀN, làm tuần tự và DỪNG LẠI hỏi xác nhận
trước mỗi bước có thể ảnh hưởng dữ liệu:

1. Chạy `git status` và `git diff --stat` rồi tóm tắt cho tôi: file nào được thêm/sửa/xóa.
2. Xóa file không còn dùng: app/(app)/don-hang/tao-moi/page.tsx
   (trang tạo đơn cũ — đã thay bằng popup; kiểm tra chắc chắn không còn nơi nào import nó).
3. Chạy `npm install` (package.json có thay đổi) và báo kết quả.
4. Chạy `npm run build`. Nếu có lỗi, sửa hoặc báo tôi.
5. Liệt kê các file trong supabase/migrations/ từ 0023 đến 0040. Cho tôi biết cách
   kiểm tra migration nào ĐÃ chạy trên Supabase production của tôi (bảng supabase_migrations
   hoặc thử query). Sau đó hướng dẫn tôi chạy NHỮNG CÁI CHƯA CÓ, theo đúng thứ tự số,
   bằng cách dán vào Supabase Dashboard → SQL Editor. TUYỆT ĐỐI không tự ý chạy lên
   production — chỉ chuẩn bị sẵn nội dung và hướng dẫn tôi bấm Run.
6. Sau khi xong, chạy `npm run dev` để tôi mở thử app kiểm tra trước khi deploy thật.

Tóm tắt nội dung thay đổi đợt này nằm trong file BAN-GIAO-DEPLOY.md.
Quan trọng nhất: KHÔNG được bỏ qua bước chạy migration, nếu thiếu thì app sẽ lỗi
"relation/function does not exist".
```

AI sẽ làm từng bước và hỏi bạn xác nhận. Bạn chỉ cần đọc và bấm đồng ý.

---

## ✋ CÁCH 2: Làm thủ công (nếu không dùng AI)

1. **Sao lưu** (mục ⚠️).
2. Giải nén gói, **copy đè** vào thư mục dự án (giữ nguyên `.env.local`, `node_modules`, `.git`).
3. **Xóa** file: `app/(app)/don-hang/tao-moi/page.tsx`
4. Mở terminal trong thư mục dự án → chạy: `npm install`
5. **Chạy migration** trên Supabase (Dashboard → SQL Editor): mở lần lượt các file
   `supabase/migrations/0023_...sql` → `0040_...sql`, dán nội dung từng file, bấm **Run**,
   **theo đúng thứ tự số**. Chỉ chạy file nào CHƯA chạy trên production.
6. Chạy `npm run build`. Không lỗi → deploy như mọi khi.

---

## 🔁 NẾU BẢN MỚI BỊ LỖI — cách quay lui

- **Code:** xóa thư mục dự án (bản mới), đổi tên `Finance System - BACKUP` về tên cũ.
- **Database:** vào Supabase → Database → Backups → Restore bản sao lưu đã tạo ở bước ⚠️.3.

---

## 📋 Bản này có gì mới?

Xem file **`BAN-GIAO-DEPLOY.md`** (cùng thư mục): 5 sửa đổi logic kế toán + danh sách migration cần chạy.

Tóm gọn: sửa bảng kê thuế theo ngày hóa đơn; đưa "Chứng từ khác" vào báo cáo dòng tiền + công nợ; thêm cảnh báo công nợ. Có **18 migration mới (0023→0040)** cần chạy lên Supabase.
