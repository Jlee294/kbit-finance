'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navGroups = [
  {
    label: 'Tổng quan',
    items: [
      { href: '/bao-cao',  label: 'Báo cáo'  },
      { href: '/rui-ro',   label: 'Sức khỏe' },
    ],
  },
  {
    label: 'Giao dịch',
    items: [
      { href: '/don-hang',   label: 'Đơn hàng'  },
      { href: '/thu-tien',   label: 'Thu tiền'  },
      { href: '/chi-vn',     label: 'Chi VN'    },
      { href: '/chi-kr',     label: 'Chi KR'    },
      { href: '/nhap-khau',  label: 'Nhập khẩu' },
    ],
  },
  {
    label: 'Kho hàng',
    items: [
      { href: '/kho',              label: 'Tồn kho'        },
      { href: '/kho/nhap',         label: '+ Nhập kho'     },
      { href: '/kho/xuat',         label: '− Xuất kho'     },
      { href: '/kho/luan-chuyen',  label: '⇄ Luân chuyển' },
      { href: '/kho/lich-su',      label: 'Lịch sử'        },
    ],
  },
  {
    label: 'Kế toán',
    items: [
      { href: '/duyet-khoa-ky',               label: 'Duyệt & Khóa kỳ' },
      { href: '/chung-tu',                    label: 'Chứng từ'         },
      { href: '/cong-viec',                   label: 'Công việc'        },
      { href: '/danh-muc/ky-ke-toan',         label: 'Kỳ kế toán'      },
      { href: '/danh-muc/loai-chung-tu',      label: 'Loại chứng từ'   },
      { href: '/danh-muc/thu-vien-nghiep-vu', label: 'Thư viện NV'     },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      { href: '/ke-hoach-thue',  label: 'Kế hoạch thuế' },
      { href: '/lich-thue',      label: 'Lịch thuế'     },
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

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav className="flex flex-col gap-5 px-3 py-4 flex-1 overflow-y-auto">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label }) => {
              const active = isActive(href)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors
                      ${active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    {label}
                    {active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
