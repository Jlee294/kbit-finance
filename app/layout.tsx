import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

// Nhận diện KBIT: Montserrat (tiêu đề) + Roboto (nội dung)
export const metadata: Metadata = {
  title: 'KBIT Finance',
  description: 'Hệ thống kế toán nội bộ KBIT Holdings',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
