import { redirect } from 'next/navigation'

// Gộp vào trang Tồn kho (G3): luân chuyển nay làm qua popup (ô chọn loại) tại /kho.
export default function LuanChuyenRedirect() {
  redirect('/kho')
}
