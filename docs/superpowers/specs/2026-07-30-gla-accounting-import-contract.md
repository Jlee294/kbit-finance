# Hợp đồng nghiệp vụ kế toán và nhập dữ liệu GLA

Ngày chốt: 2026-07-30

## Năng lực cần có

Kế toán hoặc admin không chuyên môn có thể đưa một bộ file tương tự
`GLA_6 THANG DAU NAM 2026` vào khu vực tạm, để hệ thống tự nhận diện dữ liệu,
đối chiếu đầy đủ, chỉ ghi sổ khi không còn sai lệch chưa giải thích và tạo báo
cáo kiểm toán sau nhập.

## Quy tắc cố định

### Bán ra và quà tặng

- Bảng kê bán ra chứa toàn bộ hóa đơn kê khai thuế.
- Nhật ký bán chỉ chứa hóa đơn có ít nhất một dòng gắn mã hàng tồn kho.
- Hóa đơn quà tặng vẫn nằm trong bảng kê và vẫn kê VAT đầu ra.
- Hóa đơn quà tặng không ghi nhận doanh thu và không phát sinh công nợ.
- Dòng quà tặng có mã hàng vẫn xuất kho và tính giá vốn.
- Báo cáo phải giải thích riêng chênh lệch doanh thu do quà tặng.

### Mua vào và giá nhập kho

- Bảng kê mua vào chứa toàn bộ hóa đơn mua.
- Nhật ký mua chỉ chứa hóa đơn có ít nhất một dòng gắn mã hàng tồn kho.
- Giá nhập kho VND bằng tiền hàng quy đổi VND cộng thuế nhập khẩu cộng chi phí
  vận chuyển/dịch vụ trực tiếp.
- VAT nhập khẩu được khấu trừ không vào giá nhập kho.
- Tiền hàng là công nợ nhà cung cấp nước ngoài.
- Thuế nhập khẩu và VAT nhập khẩu là công nợ cơ quan hải quan/thuế.
- Vận chuyển/dịch vụ là công nợ đơn vị cung cấp tương ứng.

### Danh mục

- Mã hàng giữ nguyên tuyệt đối (kể cả chữ hoa/chữ thường) từ Nhật ký/NXT Quyên gửi.
- Mã công nợ giữ nguyên tuyệt đối từ file tổng hợp công nợ Quyên gửi.
- Không dùng MST thay mã công nợ; MST chỉ dùng để ghép đúng đối tác với mã nguồn.
- Không tự sinh `KH...`, `NCC...`, `MH...` hoặc bất kỳ mã thay thế nào.
- Dòng có tác động 131/331 mà chưa map được mã nguồn phải bị chặn trước khi ghi sổ.
- Quà tặng, hóa đơn thay thế bằng 0 và giao dịch tiền không qua 131/331 không được tạo
  một đối tác công nợ giả.
- SPNH/tiền mặt ưu tiên mã nguồn có sẵn; nếu không có mã thì ghép bằng MST/tên chính xác
  hoặc dấu vết duy nhất ngày + số tiền trong chi tiết công nợ. Ghép mơ hồ phải dừng.

### Kho

- Tồn đầu kỳ được ghi trước phát sinh.
- Cùng ngày: nhập kho trước, xuất kho sau.
- Chỉ ghi sổ sau khi toàn bộ file đã được đưa vào staging và đối chiếu.
- Giá vốn bình quân liên hoàn phải có thể dựng lại theo trình tự thời gian.

### Công nợ

- Phải thu: đầu kỳ thuần = Nợ - Có; bán chịu tăng Nợ; thu tiền tăng Có.
- Phải trả: đầu kỳ thuần = Có - Nợ; mua chịu tăng Có; trả tiền tăng Nợ.
- Hóa đơn mua trong nước làm tăng phải trả theo tổng thanh toán gồm VAT.
- Hóa đơn quà tặng không làm tăng phải thu.

### Tiền mặt

- Có số dư đầu kỳ, thu trong kỳ, chi trong kỳ và số dư cuối kỳ.
- Số dư cuối = số dư đầu + thu - chi.
- Chứng từ tiền mặt được ghép khách hàng/nhà cung cấp và hóa đơn như ngân hàng.

### Phân loại dòng mua không qua kho

Danh mục mặc định gồm `expense`, `prepaid`, `tool`, `fixed_asset`, `tax_fee`,
`pass_through`, `contract_penalty`, `other`. Người dùng có quyền tạo thêm loại.

## Trạng thái lô nhập

`draft -> parsed -> needs_review -> validated -> approved -> posted`

Lô có thể chuyển sang `failed`, `rejected` hoặc `rolled_back`. Chỉ `validated`
mới được duyệt; chỉ `approved` mới được ghi sổ.

## Cổng kiểm tra bắt buộc

- Mọi dòng nguồn đã được nhận diện hoặc có lỗi cụ thể.
- Nhật ký là tập con của bảng kê.
- Số hóa đơn, tổng trước thuế và VAT khớp nguồn.
- Mã hàng và đối tác được map/tạo 100%.
- Không có khóa hóa đơn hoặc giao dịch ngân hàng trùng.
- Tồn đầu + nhập - xuất = tồn cuối cả số lượng và giá trị.
- Công nợ đầu + phát sinh tăng - phát sinh giảm = công nợ cuối.
- Tiền đầu + tăng - giảm = tiền cuối.
- Mọi chênh lệch có dòng nguồn, số tiền và lý do.
- NXT và bảng tổng hợp công nợ là tài liệu đối chiếu; không được dùng để khóa số cuối kỳ
  hoặc sinh dòng bù làm khớp số.

## Điều kiện bàn giao

Không được báo hoàn thành nếu còn chênh lệch chưa giải thích. Bộ GLA phải được
đưa qua chính luồng import người dùng, không dùng fixture hoặc script riêng, và
đạt toàn bộ cổng kiểm tra nguồn.
