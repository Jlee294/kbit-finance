# HƯỚNG DẪN GIAO CHO AI/ADMIN CẬP NHẬT

Đọc trước: `BAN-GIAO-ADMIN-2026-07-31.md` và `AGENTS.md`.

Dán nguyên yêu cầu sau cho AI phụ trách repository production:

```text
Tôi có gói source KBIT Finance cập nhật ngày 31/07/2026.

Hãy cập nhật AN TOÀN trên một nhánh riêng. Không tự ý deploy production và không
tự ý chạy migration lên production.

1. Sao lưu code và xác nhận database đã có backup/PITR.
2. Kiểm tra trạng thái repository hiện tại và ghi nhận mọi thay đổi chưa commit.
3. Merge toàn bộ source mới, nhưng giữ nguyên .git, .env.local và secret production.
4. Đọc đầy đủ BAN-GIAO-ADMIN-2026-07-31.md và AGENTS.md.
5. Chạy npm ci, npx tsc --noEmit, npm run test:handoff và npm run build.
6. So sánh lịch sử migration database với toàn bộ supabase/migrations từ 0001
   đến 0059. Báo rõ migration nào thiếu. Chỉ chuẩn bị kế hoạch chạy file còn thiếu
   theo đúng thứ tự; hỏi tôi xác nhận trước khi tác động staging hoặc production.
7. Trên staging, chạy toàn bộ checklist mục 6 trong tài liệu bàn giao.
8. Báo cáo file đã thay đổi, migration đã áp dụng, kết quả test/build, lỗi còn lại
   và phương án rollback.

Không chép số cuối kỳ NXT/công nợ nguồn vào app, không tạo bút toán bù, không tự
tạo mã hàng/mã công nợ khi file nguồn đã quy định mã.
```
