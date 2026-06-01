'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/auth'

interface NavGroup {
  label: string
  items: { href: string; label: string }[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Tổng quan',
    items: [
      { href: '/bao-cao',          label: 'Báo cáo'         },
      { href: '/cong-no',          label: 'Công nợ'         },
      { href: '/bang-ke-ban-ra',   label: 'Bảng kê bán ra'  },
      { href: '/bang-ke-mua-vao',  label: 'Bảng kê mua vào' },
      { href: '/rui-ro',           label: 'Sức khỏe'        },
    ],
  },
  {
    label: 'Giao dịch',
    items: [
      { href: '/don-hang',         label: 'Nhật ký bán ra'  },
      { href: '/nhap-khau',        label: 'Nhật ký mua vào' },
      { href: '/ngan-hang',        label: 'Ngân hàng'       },
      { href: '/chung-tu-khac',    label: 'Chứng từ khác'   },
    ],
  },
  {
    label: 'Kho hàng',
    items: [
      { href: '/kho',              label: 'Tồn kho'     },
      { href: '/kho/nhap',         label: 'Nhập kho'    },
      { href: '/kho/xuat',         label: 'Xuất kho'    },
      { href: '/kho/luan-chuyen',  label: 'Luân chuyển' },
      { href: '/kho/lich-su',      label: 'Lịch sử'     },
    ],
  },
  {
    label: 'Kế toán',
    items: [
      { href: '/duyet-khoa-ky',               label: 'Duyệt & Khóa kỳ'   },
      { href: '/chung-tu',                    label: 'Tài liệu đính kèm' },
      { href: '/cong-viec',                   label: 'Công việc'         },
      { href: '/danh-muc/ky-ke-toan',         label: 'Kỳ kế toán'        },
      { href: '/danh-muc/loai-chung-tu',      label: 'Loại chứng từ'     },
      { href: '/danh-muc/thu-vien-nghiep-vu', label: 'Thư viện NV'       },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      { href: '/ke-hoach-thue', label: 'Kế hoạch thuế' },
      { href: '/lich-thue',     label: 'Lịch thuế'     },
    ],
  },
  {
    label: 'Danh mục',
    items: [
      { href: '/danh-muc/cong-ty',             label: 'Công ty'      },
      { href: '/danh-muc/du-an',               label: 'Dự án'        },
      { href: '/danh-muc/khach-hang',          label: 'Khách hàng'   },
      { href: '/danh-muc/nha-cung-cap',        label: 'Nhà cung cấp' },
      { href: '/danh-muc/tai-khoan-ngan-hang', label: 'Tài khoản NH' },
      { href: '/danh-muc/san-pham',            label: 'Sản phẩm'     },
      { href: '/danh-muc/ty-gia',              label: 'Tỷ giá'       },
    ],
  },
]

// Routes chỉ dành cho admin + CEO
const COST_ROUTES = new Set(['/danh-muc/san-pham'])

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const canSeeCosts = role === 'admin' || role === 'ceo'

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav className="flex flex-col gap-4 px-3 py-4 flex-1 overflow-y-auto">
      {navGroups.map((group) => {
        const visibleItems = group.items.filter(
          ({ href }) => !COST_ROUTES.has(href) || canSeeCosts
        )
        if (visibleItems.length === 0) return null

        return (
          <div key={group.label}>
            {/* Group label — TẤT CẢ đều nổi bật: brand color + bold + uppercase */}
            <p className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-800">
              {group.label}
            </p>

            {/* Items — đồng nhất size + style */}
            <ul className="space-y-0.5">
              {visibleItems.map(({ href, label }) => {
                const active = isActive(href)
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`flex items-center justify-between px-3 py-1.5 rounded-md text-[13px] transition-colors
                        ${active
                          ? 'bg-brand-50 text-brand-800 font-semibold'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-brand-800'
                        }`}
                    >
                      <span>{label}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-800 shrink-0" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
