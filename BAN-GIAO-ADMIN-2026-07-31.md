# BÀN GIAO KBIT FINANCE CHO ADMIN — 31/07/2026

## 1. Kết luận

Đây là **toàn bộ source code mới nhất**, không phải một bản vá rời. Admin cần merge
toàn bộ source vào repository chính, giữ nguyên cấu hình production của họ, chạy
database migration còn thiếu rồi kiểm tra trên staging trước khi deploy.

Trạng thái tại thời điểm đóng gói:

- TypeScript `tsc --noEmit`: **PASS**.
- Next.js production build: **PASS**.
- Bộ test nghiệp vụ bàn giao: **90/90 PASS**, chạy bằng `npm run test:handoff`.
- Đối chiếu GLA từ 8 file Excel: **52 pass / 1 explained / 0 fail**.
- Chênh lệch explained duy nhất: **506.694,41 VND** ở giá vốn/tồn kho do app dùng
  bình quân liên hoàn; số lượng và luồng nhập/xuất vẫn khớp.
- Full `npm test` còn chứa các integration test cũ bắt buộc có Supabase local,
  schema `auth` và tài khoản test. Không được xem lỗi “supabaseUrl is required”
  khi chưa dựng môi trường integration là lỗi của source bàn giao.
- ESLint toàn repository hiện còn nợ kỹ thuật từ source cũ. `npm run lint` chưa
  xanh, nhưng type-check và production build đều xanh. Nếu CI của admin bắt buộc
  lint sạch, admin cần lập một nhánh riêng để xử lý lint trước khi bật quality gate.

## 2. Nội dung thay đổi chính

1. Chuẩn hóa luồng nghiệp vụ kế toán và lưu thành bộ nhớ bắt buộc trong
   `AGENTS.md`.
2. Bổ sung nền tảng staging/import theo lô, lineage nguồn, kiểm tra đối chiếu,
   post nguyên tử và rollback.
3. Không chép cứng số cuối kỳ công nợ hoặc NXT từ file đối chiếu vào sổ nghiệp vụ.
4. Tồn kho:
   - Tồn đầu kỳ → NXT đầu kỳ.
   - Nhật ký mua → nhập kho.
   - Nhật ký bán → xuất kho.
   - Giá vốn tính bình quân liên hoàn; cùng ngày nhập trước, xuất sau.
5. Công nợ:
   - Bảng kê bán ra → phát sinh Nợ phải thu.
   - Thu ngân hàng/tiền mặt có mã khách hàng → phát sinh Có phải thu.
   - Bảng kê mua vào → phát sinh Có phải trả.
   - Chi ngân hàng/tiền mặt có mã nhà cung cấp → phát sinh Nợ phải trả.
6. Bổ sung khai báo công nợ đầu kỳ, tiền mặt đầu kỳ và số dư đầu kỳ ngân hàng.
7. Bổ sung xử lý hóa đơn quà tặng: vẫn kê VAT, không doanh thu/công nợ, nhưng
   vẫn xuất kho và ghi giá vốn nếu có mã hàng.
8. Bổ sung nguyên giá hàng nhập khẩu gồm tiền hàng + thuế nhập khẩu + chi phí
   trực tiếp; VAT nhập khẩu được khấu trừ không vào giá vốn.
9. Mã hàng và mã công nợ của bộ Quyên/GLA phải giữ nguyên chính xác từ file nguồn.
10. Loại bỏ menu “Nhập bộ dữ liệu”; import kế toán là quy trình headless cho
    AI/admin, không phải màn hình chung cho người dùng.

## 3. Các migration bắt buộc phải kiểm tra

Source chứa migration từ `0001` đến `0059`. Admin phải kiểm tra lịch sử migration
trên database production và chỉ chạy những file còn thiếu, theo đúng thứ tự.

Nhóm mới nhất:

| Migration | Nội dung |
|---|---|
| `0055_debt_opening_balances.sql` | Số dư đầu kỳ phải thu/phải trả |
| `0056_accounting_import_foundation.sql` | Batch, staging, lineage, mapping, RLS và nền tảng import |
| `0057_import_landed_cost_totals.sql` | Tổng chi phí cấu thành giá hàng nhập khẩu |
| `0058_import_posting_and_rollback.sql` | Post nguyên tử, đối chiếu và rollback |
| `0059_bank_opening_balances.sql` | Số dư đầu kỳ theo tài khoản ngân hàng/năm |

Nếu database hiện đã ở `0055`, chạy tiếp `0056` → `0059`. Không chạy lại migration
đã có và không tự ý chạy thẳng lên production khi chưa sao lưu.

## 4. Biến môi trường

Gói bàn giao không chứa `.env.local`.

Admin giữ các secret production hiện tại và đối chiếu thêm với `.env.example`.
Trên production:

```env
KBIT_DEMO_MODE=false
```

Hoặc bỏ hoàn toàn biến `KBIT_DEMO_MODE`. Tuyệt đối không để bằng `true`, vì chế độ
đó chỉ dùng để xem bộ GLA local.

Các biến Supabase production tối thiểu:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 5. Trình tự cập nhật an toàn

1. Sao lưu repository/app đang chạy và database production.
2. Tạo nhánh cập nhật riêng.
3. Giải nén source mới và merge toàn bộ vào repository. Không chép đè
   `.env.local`, `.git` hoặc cấu hình secret production.
4. Chạy:

   ```bash
   npm ci
   npx tsc --noEmit
   npm run test:handoff
   npm run build
   ```

5. So sánh migration production với `supabase/migrations`; áp dụng file còn thiếu
   theo thứ tự trong môi trường staging.
6. Khởi động staging và chạy checklist ở mục 6.
7. Chỉ deploy production sau khi checklist đạt.

## 6. Checklist smoke test trên staging

- Đăng nhập bằng Admin, Kế toán và Viewer; xác nhận đúng quyền xem/sửa.
- `/cong-no/so-du-dau-ky`: nhập và lưu được đầu kỳ phải thu/phải trả.
- `/kho/so-du-dau-ky`: nhập và lưu được đầu kỳ tồn kho.
- `/chung-tu-khac`: có chỗ khai báo tiền mặt đầu kỳ.
- `/ngan-hang`: có chỗ khai báo số dư đầu kỳ theo từng tài khoản/năm.
- Nhập một hóa đơn bán dịch vụ: có bảng kê bán ra và công nợ, không vào NXT.
- Nhập một hóa đơn bán có mã hàng: có bảng kê, nhật ký bán, xuất NXT và giá vốn.
- Nhập mua vào dịch vụ: có bảng kê/công nợ, không nhập kho.
- Nhập mua có mã hàng: có bảng kê, nhật ký mua và nhập NXT.
- Thu khách hàng qua ngân hàng/tiền mặt làm giảm phải thu.
- Trả nhà cung cấp qua ngân hàng/tiền mặt làm giảm phải trả.
- Kiểm tra cuối kỳ = đầu kỳ + phát sinh tăng − phát sinh giảm.
- Menu không còn mục “Nhập bộ dữ liệu”.

## 7. Quy trình import bộ Quyên/GLA

AI/admin phải đọc toàn bộ `AGENTS.md` trước khi import. Trình tự bắt buộc:

1. Tồn kho, công nợ, ngân hàng và tiền mặt đầu kỳ.
2. Bảng kê bán ra + Nhật ký bán hàng.
3. Bảng kê mua vào + Nhật ký mua hàng.
4. SPNH + sổ tiền mặt.
5. Để hệ thống tự tính NXT, công nợ, giá vốn và lãi/lỗ.
6. Dùng NXT và tổng hợp công nợ nguồn chỉ để đối chiếu.
7. Chỉ bàn giao khi 0 lỗi và 0 chênh lệch chưa giải trình.

Không tự tạo mã thay file nguồn, không tạo bút toán bù và không chép số cuối kỳ
nguồn vào bảng kết quả.

## 8. Bộ GLA đi kèm

Gói dữ liệu đối chiếu gồm 8 file:

- Bảng kê bán ra.
- Bảng kê mua vào.
- Nhật ký bán.
- Nhật ký mua.
- Nhập xuất tồn.
- Tổng hợp công nợ phải thu.
- Tổng hợp công nợ phải trả.
- SPNH GLA.

Chạy lại kiểm tra:

```bash
npm run audit:gla -- "../GLA_6 THANG DAU NAM 2026"
```

Kết quả chi tiết nằm trong `data/gla-audit-2026.json`.

## 9. Rollback

- Code: quay lại nhánh/commit trước khi cập nhật.
- Database: khôi phục backup hoặc phương án PITR đã chuẩn bị.
- Import batch: chỉ dùng hàm rollback đã phê duyệt trong migration `0058`; không
  xóa tay từng sổ vì sẽ làm mất lineage và lệch liên bảng.

## 10. Điều admin cần phản hồi sau khi cập nhật

- Commit/tag đã deploy.
- Migration cuối cùng trên staging và production.
- Kết quả `npm run test:handoff`.
- Kết quả `npm run build`.
- Kết quả checklist mục 6.
- Danh sách chênh lệch còn lại, nếu có, kèm nguyên nhân.
