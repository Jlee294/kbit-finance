import { redirect } from 'next/navigation'

// Gộp vào trang Tồn kho (G3): xuất kho nay làm qua nút + popup tại /kho.
export default function XuatKhoRedirect() {
  redirect('/kho')
}
