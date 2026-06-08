import { redirect } from 'next/navigation'

// Gộp vào trang "Đối tác" (2 tab). Giữ route cũ để link/bookmark cũ vẫn chạy.
export default function NhaCungCapRedirect() {
  redirect('/danh-muc/doi-tac?tab=nha-cung-cap')
}
