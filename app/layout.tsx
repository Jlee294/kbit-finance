import type { Metadata } from 'next'
import { Montserrat, Roboto } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

// Nhận diện KBIT: Montserrat (tiêu đề) + Roboto (nội dung)
const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})
const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'KBIT Finance',
  description: 'Hệ thống kế toán nội bộ KBIT Holdings',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${montserrat.variable} ${roboto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
