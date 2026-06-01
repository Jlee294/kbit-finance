'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/auth'

/**
 * Cấu trúc sidebar có 2 cấp ưu tiên:
 *  - tier 'primary'   = nhóm dùng HÀNG NGÀY (Giao dịch, Kho hàng) → label rõ, item text đậm
 *  - tier 'secondary' = nhóm tổng hợp / xem (Tổng quan, Kế toán, Tài chính)
 *  - tier 'tertiary'  = nhóm khai báo (Danh mục) → label mờ, item text nhỏ
 *
 * Section title hiển thị 2 cấp:
 *  - 'NHẬP LIỆU HÀNG NGÀY' (uppercase, brand) — banner trên primary groups
 *  - 'XEM & TỔNG HỢP'                          — banner trên secondary groups
 *  - 'HỆ THỐNG'                                 — banner trên tertiary
 */

type Tier = 'primary' | 'secondary' | 'tertiary'

interface NavGroup {
  label: string
  tier:  Tier
  items: { href: string; label: string }[]
}

const navGroups: NavGroup[] = [
  // ── PRIMARY ──────────────────────────────────────────
  {
    label: 'Giao dịch',
    tier:  'primary',
    items: [
      { href: '/don-hang',         label: 'Nhật ký bán ra'  },
      { href: '/nhap-khau',        label: 'Nhật ký mua vào' },
      { href: '/ngan-hang',        label: 'Ngân hàng'       },
      { href: '/chung-tu-khac',    label: 'Chứng từ khác'   },
    ],
  },
  {
    label: 'Kho hàng',
    tier:  'primary',
    items: [
      { href: '/kho',              label: 'Tồn kho'     },
      { href: '/kho/nhap',         label: 'Nhập kho'    },
      { href: '/kho/xuat',         label: 'Xuất kho'    },
      { href: '/kho/luan-chuyen',  label: 'Luân chuyển' },
      { href: '/kho/lich-su',      label: 'Lịch sử'     },
    ],
  },

  // ── SECONDARY ────────────────────────────────────────
  {
    label: 'Tổng quan',
    tier:  'secondary',
    items: [
      { href: '/bao-cao',          label: 'Báo cáo'         },
      { href: '/cong-no',          label: 'Công nợ'         },
      { href: '/bang-ke-ban-ra',   label: 'Bảng kê bán ra'  },
      { href: '/bang-ke-mua-vao',  label: 'Bảng kê mua vào' },
      { href: '/rui-ro',           label: 'Sức khỏe'        },
    ],
  },
  {
    label: 'Kế toán',
    tier:  'secondary',
    items: [
      { href: '/duyet-khoa-ky',               label: 'Duyệt & Khóa kỳ'  },
      { href: '/chung-tu',                    label: 'Tài liệu đính kèm' },
      { href: '/cong-viec',                   label: 'Công việc'         },
      { href: '/danh-muc/ky-ke-toan',         label: 'Kỳ kế toán'        },
      { href: '/danh-muc/loai-chung-tu',      label: 'Loại chứng từ'    },
      { href: '/danh-muc/thu-vien-nghiep-vu', label: 'Thư viện NV'       },
    ],
  },
  {
    label: 'Tài chính',
    tier:  'secondary',
    items: [
      { href: '/ke-hoach-thue', label: 'Kế hoạch thuế' },
      { href: '/lich-thue',     label: 'Lịch thuế'     },
    ],
  },

  // ── TERTIARY ─────────────────────────────────────────
  {
    label: 'Danh mục',
    tier:  'tertiary',
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

// Banner phân chia 3 tier
const TIER_BANNERS: Record<Tier, { label: string; sub?: string }> = {
  primary:   { label: 'Nhập liệu hàng ngày', sub: 'Dữ liệu chính chảy vào báo cáo' },
  secondary: { label: 'Xem & Tổng hợp' },
  tertiary:  { label: 'Hệ thống' },
}

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const canSeeCosts = role === 'admin' || role === 'ceo'

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Track tier transitions để vẽ banner
  let lastTier: Tier | null = null

  return (
    <nav className="flex flex-col gap-4 px-3 py-4 flex-1 overflow-y-auto">
      {navGroups.map((group) => {
        const visibleItems = group.items.filter(
          ({ href }) => !COST_ROUTES.has(href) || canSeeCosts
        )
        if (visibleItems.length === 0) return null

        const showBanner = group.tier !== lastTier
        lastTier = group.tier
        const banner = TIER_BANNERS[group.tier]

        return (
          <div key={group.label}>
            {/* Tier banner — phân chia rõ chính/phụ/khác */}
            {showBanner && (
              <div className={`px-3 mb-2 ${group.tier === 'primary' ? 'pt-0' : 'pt-3 border-t border-gray-100'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${
                  group.tier === 'primary'   ? 'text-brand-800' :
                  group.tier === 'secondary' ? 'text-gray-500'  :
                                               'text-gray-400'
                }`}>
                  {banner.label}
                </p>
                {banner.sub && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{banner.sub}</p>
                )}
              </div>
            )}

            {/* Group label */}
            <p className={`px-3 mb-1 ${
              group.tier === 'primary'
                ? 'text-xs font-bold text-gray-900'
                : group.tier === 'secondary'
                  ? 'text-[11px] font-semibold text-gray-700 uppercase tracking-wider'
                  : 'text-[10px] font-medium text-gray-500 uppercase tracking-wider'
            }`}>
              {group.label}
            </p>

            <ul className="space-y-0.5">
              {visibleItems.map(({ href, label }) => {
                const active = isActive(href)
                const baseSize = group.tier === 'primary' ? 'text-sm' : 'text-[13px]'
                const baseColor = group.tier === 'primary'
                  ? 'text-gray-800 font-medium'
                  : group.tier === 'secondary'
                    ? 'text-gray-600'
                    : 'text-gray-500'

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`flex items-center justify-between px-3 py-${group.tier === 'primary' ? '2' : '1.5'} rounded-md ${baseSize} transition-colors
                        ${active
                          ? 'bg-brand-50 text-brand-800 font-semibold'
                          : `${baseColor} hover:bg-gray-50 hover:text-brand-800`
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
