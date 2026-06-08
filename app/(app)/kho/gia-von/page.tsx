import { redirect } from 'next/navigation'

// Gộp vào trang Tồn kho (G3): bảng NXT + nút Khóa sổ kỳ nay nằm tại /kho.
export default function GiaVonRedirect() {
  redirect('/kho')
}
