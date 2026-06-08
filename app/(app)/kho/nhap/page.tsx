import { redirect } from 'next/navigation'

// Gộp vào trang Tồn kho (G3): nhập kho nay làm qua nút + popup tại /kho.
export default function NhapKhoRedirect() {
  redirect('/kho')
}
